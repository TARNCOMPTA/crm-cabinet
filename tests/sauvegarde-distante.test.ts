import { describe, it, expect, beforeEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, utimesSync, chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * La copie hors site : `sauvegarde-distante.sh` (serveur du CRM) et
 * `recepteur-sauvegarde.sh` (serveur de sauvegarde), rejoués ensemble.
 * ---------------------------------------------------------------------------
 * `ssh` est remplacé par un relais local qui fait exactement ce que fait sshd
 * devant une commande imposée : il place la commande demandée dans
 * SSH_ORIGINAL_COMMAND et lance le récepteur. `docker` est un mouchard qui rend
 * un faux pg_dump. Le chiffrement, lui, est VRAI : l'archive est déchiffrée à la
 * fin avec la clé de restauration, et c'est son contenu qu'on vérifie.
 *
 * Une sauvegarde n'a de valeur que si elle se relit. Ce test ne s'arrête donc
 * pas à « le fichier est arrivé ».
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EMETTEUR = resolve(RACINE, 'installation/sauvegarde-distante.sh');
const RECEPTEUR = resolve(RACINE, 'installation/recepteur-sauvegarde.sh');

interface Banc {
  t: string;
  instance: string;
  conf: string;
  depot: string;
  cle: string;
  env: NodeJS.ProcessEnv;
}

function executable(chemin: string, contenu: string) {
  writeFileSync(chemin, contenu);
  chmodSync(chemin, 0o755);
}

function monter(): Banc {
  const t = mkdtempSync(join(tmpdir(), 'sauvegarde-distante-'));
  const instance = join(t, 'instance');
  const conf = join(t, 'conf');
  const depot = join(t, 'depot');
  const bin = join(t, 'bin');
  for (const d of [instance, join(instance, 'data/storage'), join(instance, 'data/sauvegardes'), conf, depot, bin]) {
    mkdirSync(d, { recursive: true });
  }
  writeFileSync(join(instance, '.env'), 'SESSION_SECRET=valeur-factice-de-test\n');
  writeFileSync(join(instance, 'data/storage/piece.txt'), 'contenu de la piece\n');
  writeFileSync(join(instance, 'data/sauvegardes/base_ancienne.sql.gz'), 'ne doit pas partir');

  const cle = join(t, 'cle-restauration.txt');
  execFileSync('age-keygen', ['-o', cle], { stdio: 'ignore' });
  writeFileSync(join(conf, 'destinataire.age'), execFileSync('age-keygen', ['-y', cle]));
  writeFileSync(join(conf, 'cle_ssh'), 'cle factice');
  writeFileSync(join(conf, 'destination.conf'), 'DESTINATION=crmsauve@sauvegarde.invalid\nPORT=22\n');

  // Faux pg_dump : du texte SQL, plus de l'aléa pour que le gzip dépasse le
  // seuil de 2048 octets — un texte répétitif se compresse sous le seuil.
  executable(join(bin, 'docker'), `#!/bin/sh
[ -n "\${DUMP_VIDE:-}" ] && exit 0
head -c 3000 /dev/urandom | od -An -tx1 | sed 's/^/-- /'
i=0; while [ $i -lt 400 ]; do echo "INSERT INTO clients VALUES ($i, 'ligne de test');"; i=$((i+1)); done
`);
  // Relais sshd : la DERNIÈRE option est la commande demandée.
  executable(join(bin, 'ssh'), `#!/bin/sh
for a; do DEMANDE="$a"; done
if [ -n "\${ALTERER:-}" ]; then
  { cat; printf x; } | SSH_ORIGINAL_COMMAND="$DEMANDE" sh "${RECEPTEUR}"
else
  SSH_ORIGINAL_COMMAND="$DEMANDE" exec sh "${RECEPTEUR}"
fi
`);

  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    SAUVEGARDE_DIR: instance,
    SAUVEGARDE_CONF_DIR: conf,
    SAUVEGARDE_CLE_RESTAURATION: join(t, 'absente.txt'),
    RECEPTEUR_DOSSIER: depot,
  };
  return { t, instance, conf, depot, cle, env };
}

function copier(b: Banc, extra: NodeJS.ProcessEnv = {}) {
  return spawnSync('sh', [EMETTEUR], { env: { ...b.env, ...extra }, encoding: 'utf8' });
}

function recevoir(b: Banc, demande: string, entree: string | Buffer = '') {
  return spawnSync('sh', [RECEPTEUR], {
    env: { ...b.env, SSH_ORIGINAL_COMMAND: demande },
    input: entree,
    encoding: 'utf8',
  });
}

function copies(b: Banc) {
  return readdirSync(b.depot).filter((f) => f.startsWith('crm_')).sort();
}

function chiffre(b: Banc, texte: string): Buffer {
  return execFileSync('age', ['-R', join(b.conf, 'destinataire.age')], { input: texte });
}

describe('sauvegarde distante — une copie complete, puis relue', () => {
  let b: Banc;
  beforeEach(() => { b = monter(); });

  it('depose une archive chiffree qui se dechiffre et contient tout', () => {
    const r = copier(b);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/OK crm_\d{4}-\d{2}-\d{2}_\d{6}\.tar\.age/);

    const [nom] = copies(b);
    expect(nom).toBeDefined();
    const archive = readFileSync(join(b.depot, nom));
    // Chez l'hébergeur, rien en clair.
    expect(archive.subarray(0, 21).toString()).toBe('age-encryption.org/v1');
    expect(archive.includes(Buffer.from('ligne de test'))).toBe(false);

    const tar = execFileSync('age', ['-d', '-i', b.cle, join(b.depot, nom)]);
    const liste = execFileSync('tar', ['-tf', '-'], { input: tar, encoding: 'utf8' }).split('\n');
    expect(liste).toContain('./.env');
    expect(liste).toContain('./data/storage/piece.txt');
    expect(liste).toContain('./base.sql.gz');
    // Les sauvegardes locales de maj.sh ne repartent pas une seconde fois.
    expect(liste.some((l) => l.includes('sauvegardes'))).toBe(false);

    const base = execFileSync('sh', ['-c', 'tar -xOf - ./base.sql.gz | gunzip'], { input: tar, encoding: 'utf8' });
    expect(base).toContain("INSERT INTO clients VALUES (399, 'ligne de test');");

    const etat = JSON.parse(readFileSync(join(b.instance, 'data/sauvegarde-distante.json'), 'utf8'));
    expect(etat.fichier).toBe(nom);
    expect(etat.derniere_reussite).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('echoue, et le dit, sur un pg_dump vide', () => {
    const r = copier(b, { DUMP_VIDE: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('suspecte');
    expect(copies(b)).toEqual([]);
  });

  it('detecte une copie alteree en route, et garde la date de la derniere reussite', () => {
    expect(copier(b).status).toBe(0);
    const avant = JSON.parse(readFileSync(join(b.instance, 'data/sauvegarde-distante.json'), 'utf8'));
    // Un nom par seconde : sans cette pause, la seconde copie heurterait la première.
    execFileSync('sleep', ['1.1']);
    const r = copier(b, { ALTERER: '1' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('empreinte');
    const apres = JSON.parse(readFileSync(join(b.instance, 'data/sauvegarde-distante.json'), 'utf8'));
    expect(apres.derniere_reussite).toBe(avant.derniere_reussite);
    expect(apres.dernier_echec).toBeDefined();
  });
});

describe('recepteur — ne sait qu ajouter', () => {
  let b: Banc;
  beforeEach(() => { b = monter(); });

  it('refuse un fichier non chiffre', () => {
    const r = recevoir(b, 'deposer crm_2026-01-01_000000.tar.age', 'fiches clients en clair');
    expect(r.stdout).toContain('non chiffre');
    expect(r.status).not.toBe(0);
    expect(readdirSync(b.depot)).toEqual([]);
  });

  it('refuse un nom hors du format, dont une remontee de dossier', () => {
    for (const nom of ['../evasion.tar.age', 'crm_x.tar.age', '.bashrc']) {
      const r = recevoir(b, `deposer ${nom}`, chiffre(b, 'x'));
      expect(r.stdout, nom).toContain('nom invalide');
    }
    expect(existsSync(join(b.t, 'evasion.tar.age'))).toBe(false);
  });

  it('n ecrase jamais une copie existante', () => {
    const nom = 'crm_2026-01-01_000000.tar.age';
    expect(recevoir(b, `deposer ${nom}`, chiffre(b, 'premiere')).stdout).toMatch(/^OK /);
    const premiere = readFileSync(join(b.depot, nom));
    const r = recevoir(b, `deposer ${nom}`, chiffre(b, 'seconde'));
    expect(r.stdout).toContain('existe deja');
    expect(readFileSync(join(b.depot, nom)).equals(premiere)).toBe(true);
  });

  it('refuse toute autre commande : lire, lister, effacer', () => {
    for (const demande of ['cat crm_2026-01-01_000000.tar.age', 'rm -rf /', 'sh', '', 'etat; rm -rf /']) {
      const r = recevoir(b, demande);
      expect(r.status, demande).not.toBe(0);
      expect(r.stdout, demande).toMatch(/^REFUS/);
    }
  });

  it('borne le nombre de depots par 24 h', () => {
    for (let i = 0; i < 4; i++) {
      expect(recevoir(b, `deposer crm_2026-01-01_00000${i}.tar.age`, chiffre(b, 'x')).stdout).toMatch(/^OK /);
    }
    expect(recevoir(b, 'deposer crm_2026-01-01_000009.tar.age', chiffre(b, 'x')).stdout).toContain('trop de depots');
  });

  it('fait le menage sur SON horloge : 35 jours, puis une par mois pendant un an', () => {
    const jour = 86_400_000;
    const vieillir = (nom: string, joursAvant: number) => {
      writeFileSync(join(b.depot, nom), 'age-encryption.org/v1\n');
      const d = new Date(Date.now() - joursAvant * jour);
      utimesSync(join(b.depot, nom), d, d);
    };
    // Deux copies du même mois, vieilles de plus de 35 jours : seule la
    // première du mois reste. Au-delà d'un an, plus rien.
    const debutMois = new Date();
    debutMois.setUTCMonth(debutMois.getUTCMonth() - 3, 2);
    const j0 = Math.floor((Date.now() - debutMois.getTime()) / jour);
    vieillir('crm_2000-01-01_000001.tar.age', j0);
    vieillir('crm_2000-01-01_000002.tar.age', j0 - 1);
    vieillir('crm_2000-01-01_000003.tar.age', 400);
    vieillir('crm_2000-01-01_000004.tar.age', 10);

    expect(recevoir(b, 'deposer crm_2026-01-01_000000.tar.age', chiffre(b, 'x')).stdout).toMatch(/^OK /);
    expect(copies(b)).toEqual([
      'crm_2000-01-01_000001.tar.age',
      'crm_2000-01-01_000004.tar.age',
      'crm_2026-01-01_000000.tar.age',
    ]);
  });

  it('etat ne donne que des compteurs', () => {
    recevoir(b, 'deposer crm_2026-01-01_000000.tar.age', chiffre(b, 'x'));
    const r = recevoir(b, 'etat');
    expect(r.stdout).toMatch(/^OK sauvegardes=1 derniere=crm_2026-01-01_000000\.tar\.age libre_mo=\d+/);
  });
});
