#!/usr/bin/env node
/**
 * Génère src/types/database.ts depuis le schéma réel de la base.
 * ---------------------------------------------------------------------------
 *
 *   docker compose run --rm -T \
 *     -v /opt/crmcabinet/scripts:/app/scripts \
 *     -v /opt/crmcabinet/src:/app/src \
 *     -v /opt/crmcabinet/.env:/app/.env:ro \
 *     app node /app/scripts/generer-types.mjs
 *
 * Historique : ce fichier de plus de 3 800 lignes était d'abord maintenu à la
 * main et avait dérivé. Une première version de ce script l'a régénéré depuis
 * `schema/actuel.json` — un instantané du schéma de Bolt — en lui appliquant la
 * transformation mono-cabinet.
 *
 * Cette version-ci interroge **la base en place**. C'est un changement de nature
 * plus que de degré : il n'y a plus d'instantané à tenir à jour, plus de liste
 * de tables retirées à maintenir en double, et plus de transformation à
 * rejouer. Ce que la base contient est ce que les types décrivent. Une
 * divergence redevient impossible plutôt que probable.
 *
 * Deux apports par rapport à la version précédente :
 *
 *   · le bloc `Functions` est rempli. Il était `[_ in never]: never`, ce qui
 *     laissait les quatre `rpc()` du front sans aucun type — et c'est ce qui a
 *     permis à trois noms d'arguments mutilés par la transformation
 *     mono-cabinet de passer inaperçus jusqu'à l'exécution ;
 *   · les colonnes GÉNÉRÉES sont dans `Row` mais pas dans `Insert` ni
 *     `Update` : PostgreSQL refuse qu'on leur donne une valeur.
 *
 * La queue du fichier — alias de domaine et interfaces avec jointures, écrits à
 * la main — est PRÉSERVÉE telle quelle.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CIBLE = resolve(RACINE, 'src/types/database.ts');

function lireEnv() {
  const chemin = resolve(RACINE, '.env');
  if (!existsSync(chemin)) return {};
  const env = {};
  for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

/** `format_type` de PostgreSQL -> type TypeScript. */
function versTs(pg) {
  const t = pg.toLowerCase().trim();
  if (t.endsWith('[]')) return `${versTs(t.slice(0, -2))}[]`;
  if (t === 'uuid' || t.startsWith('text') || t.startsWith('character') ||
      t.startsWith('varchar') || t === 'name' || t === 'citext') return 'string';
  if (t === 'boolean' || t === 'bool') return 'boolean';
  if (t === 'json' || t === 'jsonb') return 'Json';
  if (/^(small|big)?int/.test(t) || t.startsWith('numeric') || t.startsWith('decimal') ||
      t === 'real' || t === 'double precision' || t === 'money') return 'number';
  if (t.startsWith('timestamp') || t === 'date' || t.startsWith('time') ||
      t === 'interval') return 'string';
  if (t === 'bytea') return 'string';
  return 'string';
}

/** `FOREIGN KEY (a) REFERENCES t(b) ON DELETE ...` -> objet exploitable. */
function parseFk(nom, def) {
  const m = def.match(/FOREIGN KEY \(([^)]+)\) REFERENCES ([^(]+)\(([^)]+)\)/i);
  if (!m) return null;
  return {
    foreignKeyName: nom,
    columns: m[1].split(',').map((s) => s.trim()),
    referencedRelation: m[2].trim().replace(/^public\./, '').replace(/"/g, ''),
    referencedColumns: m[3].split(',').map((s) => s.trim()),
  };
}

/**
 * Découpe la signature rendue par `pg_get_function_arguments`.
 *
 * Découpage à la profondeur de parenthèses, et non sur les virgules : un type
 * comme `numeric(10,2)` en contient une, et un découpage naïf inventerait un
 * argument. C'est exactement l'erreur qui a mutilé trois appels `rpc()` lors de
 * la transformation mono-cabinet — autant ne pas la refaire ici.
 */
function decouperArguments(signature) {
  const morceaux = [];
  let courant = '';
  let profondeur = 0;
  for (const c of signature) {
    if (c === '(') profondeur++;
    else if (c === ')') profondeur--;
    if (c === ',' && profondeur === 0) {
      morceaux.push(courant);
      courant = '';
    } else {
      courant += c;
    }
  }
  if (courant.trim()) morceaux.push(courant);

  const args = [];
  for (const brut of morceaux) {
    // Retire le mode (IN / OUT / INOUT / VARIADIC) et la valeur par défaut.
    let s = brut.trim().replace(/^(IN|OUT|INOUT|VARIADIC)\s+/i, '');
    const parDefaut = /\s+DEFAULT\s+/i.test(s);
    s = s.replace(/\s+DEFAULT\s+.*$/i, '').trim();
    const espace = s.indexOf(' ');
    if (espace < 0) continue; // argument sans nom : inexploitable côté PostgREST
    args.push({
      nom: s.slice(0, espace),
      type: s.slice(espace + 1).trim(),
      optionnel: parDefaut,
    });
  }
  return args;
}

/** `pg_get_function_result` -> type TypeScript du retour. */
function versTsRetour(retour) {
  const r = retour.trim();
  if (/^void$/i.test(r)) return 'undefined';
  if (/^TABLE\(/i.test(r)) {
    const dedans = r.slice(r.indexOf('(') + 1, r.lastIndexOf(')'));
    const champs = decouperArguments(dedans);
    if (champs.length === 0) return 'Json[]';
    return `{ ${champs.map((c) => `${c.nom}: ${versTs(c.type)}`).join('; ')} }[]`;
  }
  if (/^SETOF\s+/i.test(r)) {
    const base = r.replace(/^SETOF\s+/i, '');
    if (/^record$/i.test(base)) return 'Json[]';
    return `${versTs(base)}[]`;
  }
  if (/^record$/i.test(r)) return 'Json';
  return versTs(r);
}

async function main() {
  const env = lireEnv();
  const url = env.DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL introuvable, ni dans le .env ni dans l\'environnement.');

  const client = new pg.Client({ connectionString: url });
  await client.connect();

  try {
    const { rows: colonnes } = await client.query(`
      SELECT c.relname AS tab, a.attname AS col,
             format_type(a.atttypid, a.atttypmod) AS type,
             a.attnotnull AS non_nul,
             (d.adbin IS NOT NULL) AS a_defaut,
             a.attidentity::text AS identite,
             a.attgenerated::text AS genere
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY c.relname, a.attnum`);

    const { rows: contraintes } = await client.query(`
      SELECT c.relname AS tab, con.conname AS nom,
             pg_get_constraintdef(con.oid) AS definition
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND con.contype = 'f'
       ORDER BY c.relname, con.conname`);

    // `prokind = 'f'` écarte les procédures et les agrégats ; le retour
    // `trigger` écarte les fonctions de trigger, qui ne sont pas appelables
    // par PostgREST.
    const { rows: fonctions } = await client.query(`
      SELECT p.proname AS nom,
             pg_get_function_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS retour
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.prokind = 'f'
         AND pg_get_function_result(p.oid) <> 'trigger'
       ORDER BY p.proname`);

    const ancien = readFileSync(CIBLE, 'utf8').split(/\r?\n/);
    const finDatabase = ancien.findIndex((l, i) => l === '}' && i > 20);
    if (finDatabase < 0) throw new Error('Fin du bloc Database introuvable.');
    const queue = ancien.slice(finDatabase + 1);

    const parTable = (arr) => {
      const m = new Map();
      for (const r of arr) { if (!m.has(r.tab)) m.set(r.tab, []); m.get(r.tab).push(r); }
      return m;
    };
    const cols = parTable(colonnes);
    const cons = parTable(contraintes);
    const tables = [...cols.keys()].sort();

    const out = [];
    out.push('// Genere par scripts/generer-types.mjs, DEPUIS LA BASE EN PLACE.');
    out.push('// NE PAS MODIFIER A LA MAIN au-dessus de la fin du bloc Database :');
    out.push('// ce fichier etait maintenu manuellement et avait derive du schema reel,');
    out.push('// ce qui produisait des erreurs SelectQueryError sur des requetes valides.');
    out.push('// Les alias de domaine sous le bloc Database, eux, sont ecrits a la main.');
    out.push('');
    out.push('export type Json =');
    out.push('  | string');
    out.push('  | number');
    out.push('  | boolean');
    out.push('  | null');
    out.push('  | { [key: string]: Json | undefined }');
    out.push('  | Json[]');
    out.push('');
    out.push("export type UserRole = 'admin' | 'user'");
    out.push('');
    out.push('export interface Database {');
    out.push('  public: {');
    out.push('    Tables: {');

    let nbColonnes = 0;
    let nbGenerees = 0;
    for (const t of tables) {
      const colonnesT = cols.get(t) || [];
      nbColonnes += colonnesT.length;

      out.push(`      ${t}: {`);
      out.push('        Row: {');
      for (const c of colonnesT) {
        out.push(`          ${c.col}: ${versTs(c.type)}${c.non_nul ? '' : ' | null'}`);
      }
      out.push('        }');

      // Une colonne generee est calculee par la base : PostgreSQL refuse qu'on
      // lui donne une valeur, elle n'a donc rien a faire dans Insert ni Update.
      const inscriptibles = colonnesT.filter((c) => {
        if (c.genere === 's') { nbGenerees++; return false; }
        return true;
      });

      out.push('        Insert: {');
      for (const c of inscriptibles) {
        const opt = c.a_defaut || c.identite === 'a' || c.identite === 'd' || !c.non_nul;
        out.push(`          ${c.col}${opt ? '?' : ''}: ${versTs(c.type)}${c.non_nul ? '' : ' | null'}`);
      }
      out.push('        }');
      out.push('        Update: {');
      for (const c of inscriptibles) {
        out.push(`          ${c.col}?: ${versTs(c.type)}${c.non_nul ? '' : ' | null'}`);
      }
      out.push('        }');

      const fks = (cons.get(t) || [])
        .map((k) => parseFk(k.nom, k.definition))
        .filter(Boolean);

      if (fks.length === 0) {
        out.push('        Relationships: []');
      } else {
        out.push('        Relationships: [');
        for (const f of fks) {
          out.push('          {');
          out.push(`            foreignKeyName: "${f.foreignKeyName}"`);
          out.push(`            columns: [${f.columns.map((c) => `"${c}"`).join(', ')}]`);
          out.push('            isOneToOne: false');
          out.push(`            referencedRelation: "${f.referencedRelation}"`);
          out.push(`            referencedColumns: [${f.referencedColumns.map((c) => `"${c}"`).join(', ')}]`);
          out.push('          },');
        }
        out.push('        ]');
      }
      out.push('      }');
    }

    out.push('    }');
    // `Views` reste vide : le schema n'en contient aucune. La cle doit exister
    // malgre tout — sans elle, le resolveur du client typé n'instancie pas son
    // generique et fait retomber toutes les requetes sur `never`.
    out.push('    Views: {');
    out.push('      [_ in never]: never');
    out.push('    }');

    out.push('    Functions: {');
    const vues = new Set();
    let nbFonctions = 0;
    const surcharges = [];
    for (const f of fonctions) {
      if (vues.has(f.nom)) { surcharges.push(f.nom); continue; }
      vues.add(f.nom);
      nbFonctions++;
      const args = decouperArguments(f.args || '');
      out.push(`      ${f.nom}: {`);
      if (args.length === 0) {
        out.push('        Args: Record<PropertyKey, never>');
      } else {
        out.push('        Args: {');
        for (const a of args) {
          out.push(`          ${a.nom}${a.optionnel ? '?' : ''}: ${versTs(a.type)}`);
        }
        out.push('        }');
      }
      out.push(`        Returns: ${versTsRetour(f.retour)}`);
      out.push('      }');
    }
    if (nbFonctions === 0) out.push('      [_ in never]: never');
    out.push('    }');
    out.push('  }');
    out.push('}');

    const contenu = [...out, ...queue].join('\n');
    writeFileSync(CIBLE, contenu.endsWith('\n') ? contenu : contenu + '\n', 'utf8');

    console.log(`${tables.length} tables · ${nbColonnes} colonnes`);
    console.log(`${nbGenerees} colonne(s) generee(s) ecartee(s) de Insert/Update`);
    console.log(`${nbFonctions} fonction(s) exposee(s) a PostgREST`);
    if (surcharges.length > 0) {
      console.log(`/!\\ surcharges ignorees (une seule signature par nom) : ${[...new Set(surcharges)].join(', ')}`);
    }
    console.log(`bloc Database : ${out.length} lignes · queue preservee : ${queue.length} lignes`);
    console.log(`total : ${out.length + queue.length} lignes (avant : ${ancien.length})`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('');
  console.error('Echec :', e.message);
  process.exit(1);
});
