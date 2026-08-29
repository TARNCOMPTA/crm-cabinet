/**
 * Les outils du connecteur MCP, tels que l'écran des paramètres les annonce.
 * ---------------------------------------------------------------------------
 * ⚠️ CETTE LISTE ÉTAIT ÉCRITE EN DUR DANS LE JSX, ET ELLE A DÉRIVÉ. Elle
 * annonçait onze outils quand le serveur en servait seize : ni la lecture des
 * statuts, ni les deux outils de répartition — dont le SEUL qui écrive —
 * n'apparaissaient. Un écran qui énumère les accès accordés et en oublie un
 * tiers ne renseigne pas, il rassure à tort.
 *
 * Elle vit donc dans un module à part, comparé au tableau `OUTILS` du serveur
 * par `tests/outils-mcp.test.ts`. Ajouter un outil sans le déclarer ici fait
 * échouer la suite : c'est la seule façon connue d'empêcher la liste de vieillir
 * une seconde fois.
 *
 * L'écran ne peut pas interroger `/mcp` pour l'obtenir : ce point d'entrée
 * s'authentifie par clé ou par jeton OAuth, pas par la session du navigateur.
 */
export interface OutilAffiche {
  nom: string;
  /** Ce que l'outil fait, en une poignée de mots. */
  quoi: string;
  /** Vrai pour un outil qui MODIFIE. Un seul, et il se signale à l'écran. */
  ecrit?: boolean;
}

export const OUTILS_MCP: OutilAffiche[] = [
  { nom: 'list_clients', quoi: 'Lister les clients' },
  { nom: 'get_client', quoi: "Detail d'un client" },
  { nom: 'list_tasks', quoi: 'Lister les tâches' },
  { nom: 'get_task', quoi: "Détail d'une tâche" },
  { nom: 'list_fiscal_deadlines', quoi: 'Échéances fiscales' },
  { nom: 'list_balance_sheets', quoi: 'Bilans comptables' },
  { nom: 'list_opportunities', quoi: 'Opportunités' },
  { nom: 'list_collaborators', quoi: 'Collaborateurs' },
  { nom: 'list_software', quoi: 'Logiciels' },
  { nom: 'list_meeting_notes', quoi: 'Notes de RDV' },
  { nom: 'list_officers', quoi: 'Dirigeants et mandats' },
  { nom: 'get_officer', quoi: "Détail d'un dirigeant" },
  { nom: 'get_client_statuts', quoi: 'Statuts déposés au greffe' },
  { nom: 'get_client_repartition', quoi: 'Répartition des parts' },
  { nom: 'set_client_repartition', quoi: 'Enregistrer la répartition', ecrit: true },
  { nom: 'search', quoi: 'Recherche globale' },
];
