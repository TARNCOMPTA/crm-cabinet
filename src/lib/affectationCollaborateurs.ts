/**
 * Affectation de collaborateurs à un client : ce qu'un « ajout » ajoute.
 * ---------------------------------------------------------------------------
 * Ce calcul vivait EN LIGNE dans `handleSave` de ClientCollaboratorAssignModal.
 * Il est sorti ici pour une raison précise : c'est lui qui décide ce qui part en
 * base, et une décision qu'aucun test ne peut atteindre est une décision que
 * personne ne vérifie. Le défaut corrigé en même temps le montre — le mode
 * « Ajouter » n'a jamais retiré personne, et rien ne le disait.
 *
 * ⚠️ CE MODULE NE RETIRE RIEN, ET C'EST SON CONTRAT. Le mode « Ajouter » promet
 * à l'écran « sans modifier les affectations existantes » : il n'insère que ce
 * qui manque. Le retrait est le travail du mode « Remplacer », qui passe par la
 * fonction SQL `replace_client_collaborators` (DELETE puis INSERT, en une
 * transaction). Ne pas ajouter de suppression ici sans changer les deux libellés.
 */

/** Une ligne de `client_collaborators`, sans le client. */
export interface Affectation {
  user_id: string;
  /** `client_collaborators.role` : DEFAULT sans NOT NULL, donc nullable. */
  role: string | null;
}

/**
 * Les lignes à insérer pour un ajout : les souhaitées qui ne sont pas déjà là.
 *
 * L'ordre des souhaitées est conservé — l'écran les affiche dans l'ordre où on
 * les a choisies, et une insertion qui réordonne sans raison rend un journal
 * d'audit plus difficile à relire.
 *
 * DÉDOUBLONNAGE SUR `user_id`, et il n'est pas décoratif. La table PORTE une
 * contrainte `UNIQUE (client_id, user_id)` (`schema/cible.sql`) : deux entrées
 * pour la même personne ne créeraient pas de doublon, elles feraient ÉCHOUER
 * l'insertion en 23505 — et comme les lignes partent en UN SEUL `insert`, c'est
 * l'ajout ENTIER qui serait perdu, y compris les collaborateurs sans rapport
 * avec la répétition. La fenêtre l'empêche déjà en amont ; ceci est la ceinture,
 * du côté qui écrit.
 */
export function aInserer(
  existants: readonly { user_id: string }[],
  souhaites: readonly Affectation[]
): Affectation[] {
  const dejaLa = new Set(existants.map((e) => e.user_id));
  const retenus: Affectation[] = [];

  for (const souhaite of souhaites) {
    if (dejaLa.has(souhaite.user_id)) continue;
    dejaLa.add(souhaite.user_id);
    retenus.push({ user_id: souhaite.user_id, role: souhaite.role });
  }

  return retenus;
}
