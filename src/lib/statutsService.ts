/**
 * Les statuts d'un client : où les prendre, et quoi dire quand on n'a pas pu.
 * ---------------------------------------------------------------------------
 * Le pendant impur de `statuts.ts` : c'est ici qu'on parle à la base et au
 * registre. La règle de reconnaissance, elle, reste là-bas.
 *
 * ⚠️ QUATRE ÉTATS, ET SURTOUT PAS TROIS. La section se masque quand il n'y a
 * pas de statuts ; elle ne doit donc JAMAIS se masquer parce qu'on n'a pas pu
 * savoir. « Le registre est injoignable » et « cette société n'a pas déposé de
 * statuts » aboutiraient au même écran vide, et c'est le premier des deux qui
 * passerait inaperçu — indéfiniment, puisque personne ne va vérifier une
 * absence. D'où l'union discriminée : le composant ne PEUT pas les confondre.
 */
import { supabase } from './supabase';
import { syncLegalActsToDatabase } from './inpiService';
import { resumerStatuts, type ActeDepose, type ResumeStatuts } from './statuts';

export type EtatStatuts =
  /** Aucun SIREN : il n'y a rien à interroger. Section masquée. */
  | { etat: 'sans-siren' }
  /** On a cherché, le registre ne porte pas de statuts. Section masquée. */
  | { etat: 'aucun' }
  /** Section affichée. `releveLe` date le dernier passage au registre. */
  | { etat: 'connus'; resume: ResumeStatuts; releveLe: string | null }
  /** On n'a PAS pu savoir. Section affichée, avec le motif. */
  | { etat: 'erreur'; message: string };

export interface ClientPourStatuts {
  id: string;
  siren?: string | null;
  siret?: string | null;
  last_legal_sync?: string | null;
}

const COLONNES = 'id, act_type, act_category, act_date, deposit_date, inpi_reference';

/**
 * Les actes déjà connus, sans masquer l'échec.
 *
 * `getLegalActsForClient()` (inpiService) fait la même lecture mais rend `[]`
 * sur erreur : ici, ce raccourci transformerait une panne en « pas de statuts ».
 */
async function lireActes(clientId: string): Promise<ActeDepose[]> {
  const { data, error } = await supabase
    .from('legal_acts')
    .select(COLONNES)
    .eq('client_id', clientId);

  if (error) throw new Error(error.message || 'Lecture des actes impossible');
  return (data ?? []) as unknown as ActeDepose[];
}

/**
 * Les appels en cours, par client.
 *
 * React 18 monte deux fois en développement (StrictMode), et l'utilisateur peut
 * revenir sur une fiche avant la fin du premier appel. Sans ce registre, la
 * même consultation du registre partirait deux fois — un aller-retour INPI
 * facturé en latence, pour un résultat identique.
 */
const enCours = new Map<string, Promise<EtatStatuts>>();

export function chargerStatuts(client: ClientPourStatuts): Promise<EtatStatuts> {
  const existant = enCours.get(client.id);
  if (existant) return existant;

  const promesse = calculer(client).finally(() => enCours.delete(client.id));
  enCours.set(client.id, promesse);
  return promesse;
}

async function calculer(client: ClientPourStatuts): Promise<EtatStatuts> {
  let actes: ActeDepose[];
  try {
    actes = await lireActes(client.id);
  } catch (e) {
    return { etat: 'erreur', message: e instanceof Error ? e.message : 'Lecture impossible' };
  }

  const resume = resumerStatuts(actes);
  if (resume) return { etat: 'connus', resume, releveLe: client.last_legal_sync ?? null };

  // Des actes sont connus, mais aucun n'est un statut : le registre a déjà été
  // consulté, la réponse est non. Inutile d'y retourner.
  if (actes.length > 0) return { etat: 'aucun' };

  // Déjà cherché une fois, sans rien trouver. `last_legal_sync` est précisément
  // la trace de ce passage — c'est ce qui évite de réinterroger l'INPI à chaque
  // ouverture de fiche pour les sociétés qui n'ont rien déposé.
  if (client.last_legal_sync) return { etat: 'aucun' };

  if (!client.siren && !client.siret) return { etat: 'sans-siren' };

  const sync = await syncLegalActsToDatabase(client.id);
  if (sync.registreVide) return { etat: 'aucun' };
  if (!sync.success) return { etat: 'erreur', message: sync.message };

  try {
    const apres = resumerStatuts(await lireActes(client.id));
    // Des actes ont bien été enregistrés, mais aucun statut parmi eux : une
    // entreprise individuelle qui dépose ses comptes est dans ce cas.
    if (!apres) return { etat: 'aucun' };
    return { etat: 'connus', resume: apres, releveLe: new Date().toISOString() };
  } catch (e) {
    return { etat: 'erreur', message: e instanceof Error ? e.message : 'Lecture impossible' };
  }
}
