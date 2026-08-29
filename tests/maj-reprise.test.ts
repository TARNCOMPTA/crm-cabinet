import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `maj.sh` doit reprendre sur sa propre nouvelle version.
 * ---------------------------------------------------------------------------
 * ⚠️ CE CAS EST UNE PANNE DE PRODUCTION, PAS UNE HYPOTHÈSE. Le 2026-08-28, le
 * déploiement qui faisait passer le conteneur en non-root ajoutait à l'étape 4
 * de `maj.sh` un appel donnant `data/` à l'utilisateur du conteneur. Cet appel
 * n'a jamais été exécuté : le `git pull` de l'étape 3 avait remplacé `maj.sh`
 * sous ses propres pieds, et le shell — qui ne relit pas un script en cours
 * d'exécution — a poursuivi sur l'ANCIENNE version. L'image est passée en uid
 * 10001 sur un `data/` resté à root, et le premier dépôt de pièce jointe a
 * échoué en « accès refusé », chez le cabinet, sur un dossier client.
 *
 * Rien ne l'avait signalé : le déploiement s'était conclu en succès, et le
 * défaut ne se lisait que dans l'ABSENCE d'une ligne du journal. Une absence
 * ne se remarque pas — d'où ce test.
 *
 * Le scénario est rejoué en entier : dépôt git local, `docker` remplacé par un
 * mouchard, instance en retard d'une révision, et une nouvelle version de
 * `maj.sh` qui ajoute une ligne à l'étape 4. Aucun accès réseau, aucun démon.
 * Toute la mécanique est dans `tests/maj-reprise.sh`, qui reste lisible et
 * relançable à la main.
 */

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function jouer(maj: string): string[] {
  return execFileSync('bash', [resolve(RACINE, 'tests/maj-reprise.sh'), maj], {
    encoding: 'utf8',
    timeout: 120_000,
  })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

describe('installation/maj.sh — remplacé par son propre git pull', () => {
  const faits = jouer(resolve(RACINE, 'installation/maj.sh'));

  it('execute l etape 4 de la NOUVELLE version', () => {
    // Le fait qui manquait le 2026-08-28.
    expect(faits, faits.join(' | ')).toContain('SECTION4-NOUVELLE');
  });

  it('execute aussi ce que les deux versions ont en commun', () => {
    expect(faits).toContain('SECTION4-ANCIENNE');
  });

  /**
   * ⚠️ L'APPEL QUI MANQUAIT LE 2026-08-28. C'est lui, et lui seul, qui donne
   * `data/` a l'utilisateur du conteneur ; son absence a fait echouer le
   * premier depot de piece jointe chez le cabinet.
   */
  it('atteint l appel a preparer-data.sh', () => {
    expect(faits).toContain('PREPARER-DATA');
  });

  /**
   * La reprise passe par `exec`, qui remplace le processus : il ne peut pas y
   * avoir de retour, donc pas de seconde exécution de la suite. Ces trois
   * compteurs le vérifient plutôt que de le supposer — une reprise qui
   * sauvegarderait deux fois remplirait le disque, et un double
   * `docker compose up` doublerait l'interruption de service.
   */
  it('ne refait ni la sauvegarde ni la reconstruction', () => {
    expect(faits).toContain('SAUVEGARDES=1');
    expect(faits).toContain('PGDUMP=1');
    expect(faits).toContain('UP=1');
  });
});
