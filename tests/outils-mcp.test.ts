/**
 * L'écran et le serveur annoncent-ils les MÊMES outils ?
 * ---------------------------------------------------------------------------
 * ⚠️ CE TEST EXISTE PARCE QUE LA RÉPONSE ÉTAIT NON. La liste de
 * `Paramètres → Connecteur IA (MCP)` était recopiée en dur dans le JSX ; elle
 * annonçait onze outils quand le serveur en servait seize. Manquaient les deux
 * outils de dirigeants, la lecture des statuts, la lecture de la répartition —
 * et `set_client_repartition`, c'est-à-dire LE SEUL OUTIL QUI ÉCRIT. L'écran
 * censé montrer ce qu'un assistant peut faire du dossier taisait précisément la
 * chose qu'il fallait y lire.
 *
 * Rien ne l'avait signalé : deux listes, aucun lien entre elles. Le lien est
 * ici.
 */

import { describe, it, expect } from 'vitest';
import { OUTILS_MCP } from '../src/lib/outilsMcp';

// `mcp/outils.ts` importe `../db.js`, qui exige DATABASE_URL et SESSION_SECRET
// au chargement (config.ts). Ce test ne touche jamais la base — `pg.Pool` ne se
// connecte qu'a la premiere requete — mais l'import doit tout de meme les
// trouver. Meme preambule que `routes/clients.test.ts`.
process.env.DATABASE_URL ??= 'postgres://test-sans-connexion-reelle/test';
process.env.SESSION_SECRET ??= 'secret-de-test-jamais-utilise-pour-signer-32c';

const { OUTILS } = await import('../server/src/mcp/outils.js');

describe('la liste d outils affichee et celle servie', () => {
  it('porte exactement les memes noms', () => {
    const servis = OUTILS.map((o) => o.nom).sort();
    const affiches = OUTILS_MCP.map((o) => o.nom).sort();
    expect(affiches).toEqual(servis);
  });

  /**
   * Le marqueur `ecrit` n'est pas décoratif : c'est lui qui met le nom en
   * ambre et ajoute « le seul qui ecrit » à côté. Le laisser tomber sur un
   * futur outil d'écriture le ferait passer pour une lecture.
   */
  it('marque comme ecrivant, et seulement, les outils dont le nom commence par set_', () => {
    const marques = OUTILS_MCP.filter((o) => o.ecrit).map((o) => o.nom).sort();
    const attendus = OUTILS.map((o) => o.nom)
      .filter((n) => n.startsWith('set_'))
      .sort();
    expect(marques).toEqual(attendus);
    // Une garde sur la garde : si le connecteur perdait tout outil d'écriture,
    // ce test passerait en comparant deux listes vides sans rien prouver.
    expect(attendus.length).toBeGreaterThan(0);
  });

  it('ne decrit aucun outil par une chaine vide', () => {
    for (const o of OUTILS_MCP) {
      expect(o.quoi.trim(), `outil ${o.nom}`).not.toBe('');
    }
  });
});
