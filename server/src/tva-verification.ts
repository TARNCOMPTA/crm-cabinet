/**
 * Vérifier un numéro de TVA et retenir le verdict — une seule fois dans le
 * produit.
 * ---------------------------------------------------------------------------
 * Deux appelants : le bouton « Vérifier » de la fiche client (`routes/tva.ts`)
 * et la tâche périodique (`planificateur.ts`). La règle qui décide de ce qu'on
 * ÉCRIT est la même pour les deux, et elle ne doit exister qu'ici — deux copies
 * divergeraient, et celle qui tourne la nuit est celle que personne ne regarde.
 *
 * ⚠️ LA RÈGLE, C'EST QU'ON N'ÉCRIT QUE SUR UN VERDICT.
 *
 * `indisponible` signifie que VIES n'a rien vérifié. Le persister écraserait un
 * « valide » obtenu le mois dernier par une non-information — et sur une tâche
 * automatique, ce serait pire encore que sur un clic : personne ne serait là
 * pour voir que le service était en panne. La colonne `tva_verif_statut` n'a que
 * trois valeurs, et l'indisponibilité n'en fait pas partie : c'est un état de
 * l'APPEL, pas du numéro.
 */

import type { FastifyBaseLogger } from 'fastify';
import { requete } from './db.js';
import { verifier, type StatutTva, type Verdict } from './vies.js';
import {
  ESPACEMENT_MS,
  JOURS_DU_CYCLE,
  cycleTenu,
  doitInterrompre,
  tailleDuLot,
} from './tva-lot.js';

export interface VerdictEnregistre {
  verdict: Verdict;
  /** Renseigné seulement si le verdict a été retenu en base. */
  verifieLe: string | null;
}

/** Un verdict, et son enregistrement quand c'en est un. */
export async function verifierEtRetenir(
  clientId: string | null,
  numero: string
): Promise<VerdictEnregistre> {
  const verdict = await verifier(numero);
  if (!clientId) return { verdict, verifieLe: null };
  if (verdict.statut !== 'valide' && verdict.statut !== 'invalide') {
    return { verdict, verifieLe: null };
  }

  const lignes = await requete<{ tva_verif_le: string }>(
    `UPDATE clients
        SET tva_verif_statut  = $2,
            tva_verif_le      = now(),
            tva_verif_code    = $3,
            tva_verif_nom     = $4,
            tva_verif_adresse = $5
      WHERE id = $1
      RETURNING tva_verif_le`,
    [clientId, verdict.statut, verdict.code, verdict.nom, verdict.adresse]
  );
  return { verdict, verifieLe: lignes[0]?.tva_verif_le ?? null };
}

function attendre(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Les fiches à vérifier à ce passage.
 *
 * L'ORDRE PORTE LA PROMESSE, et il n'est pas décoratif :
 *
 *   1. les fiches JAMAIS vérifiées d'abord — c'est là que tombe un client créé
 *      aujourd'hui, et c'est ce qui fait de « vérification obligatoire à la
 *      création » une garantie plutôt qu'un vœu. La fiche client déclenche bien
 *      la vérification tout de suite, mais elle n'est pas le seul chemin de
 *      création : un import, le connecteur MCP ou un accès direct à PostgREST
 *      créent des fiches sans passer par cet écran. Ce tri les rattrape.
 *   2. puis la plus ancienne vérification, pour que le cycle avance sans jamais
 *      repasser deux fois sur la même avant d'avoir fait le tour.
 *
 * ⚠️ SEULEMENT LES FICHES VIVANTES. Un client inactif n'a pas besoin d'un
 * contrôle mensuel, et l'inclure gonflerait le lot quotidien de fiches dont
 * personne ne lit le statut.
 */
const SELECTION = `
  SELECT id, tva_intracom
    FROM clients
   WHERE tva_intracom IS NOT NULL
     AND statut IN ('actif', 'prospect')
     AND (tva_verif_statut = 'non_verifie'
          OR tva_verif_le IS NULL
          OR tva_verif_le < now() - ($1 || ' days')::interval)
   ORDER BY (tva_verif_le IS NULL) DESC, tva_verif_le ASC NULLS FIRST
   LIMIT $2`;

/** Le décompte de ce qui entre dans le cycle, lot ou pas. */
const ELIGIBLES = `
  SELECT count(*)::int AS n
    FROM clients
   WHERE tva_intracom IS NOT NULL
     AND statut IN ('actif', 'prospect')`;

export interface BilanLot {
  examines: number;
  valides: number;
  invalides: number;
  indisponibles: number;
  /** Vrai quand le lot s'est arrêté avant la fin, VIES ne répondant plus. */
  interrompu: boolean;
  /** Vrai quand la taille de lot ne suffit pas à tenir le mois. */
  cycleTenu: boolean;
  eligibles: number;
}

/**
 * Un passage de la tâche périodique : un lot, espacé, qui s'arrête de lui-même
 * si VIES cesse de répondre.
 */
export async function verifierLot(
  journal: FastifyBaseLogger,
  options: { espacementMs?: number } = {}
): Promise<BilanLot> {
  const compte = await requete<{ n: number }>(ELIGIBLES);
  const eligibles = compte[0]?.n ?? 0;
  const taille = tailleDuLot(eligibles);
  const bilan: BilanLot = {
    examines: 0, valides: 0, invalides: 0, indisponibles: 0,
    interrompu: false, cycleTenu: cycleTenu(eligibles), eligibles,
  };
  if (taille === 0) return bilan;

  const fiches = await requete<{ id: string; tva_intracom: string }>(SELECTION, [
    String(JOURS_DU_CYCLE),
    taille,
  ]);

  const espacement = options.espacementMs ?? ESPACEMENT_MS;
  let echecsConsecutifs = 0;

  for (const [i, fiche] of fiches.entries()) {
    // L'espacement est AVANT l'appel, sauf pour le premier : mis après, il
    // ferait attendre cinq secondes pour rien à la fin de chaque lot.
    if (i > 0) await attendre(espacement);

    const { verdict } = await verifierEtRetenir(fiche.id, fiche.tva_intracom);
    bilan.examines += 1;
    const compteur: Record<StatutTva, keyof BilanLot | null> = {
      valide: 'valides', invalide: 'invalides',
      indisponible: 'indisponibles', non_verifie: null,
    };
    const cle = compteur[verdict.statut];
    if (cle) (bilan[cle] as number) += 1;

    if (verdict.statut === 'indisponible') {
      echecsConsecutifs += 1;
      if (doitInterrompre(echecsConsecutifs)) {
        bilan.interrompu = true;
        journal.warn(
          `[tva] lot interrompu apres ${echecsConsecutifs} indisponibilites d'affilee ` +
            `(dernier code : ${verdict.code}). Le reste attendra le prochain passage.`
        );
        break;
      }
    } else {
      echecsConsecutifs = 0;
    }
  }

  return bilan;
}
