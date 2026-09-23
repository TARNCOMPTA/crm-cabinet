import { useEffect, useState } from 'react';

/**
 * Les variables de la fiche client, à insérer dans une campagne.
 * ---------------------------------------------------------------------------
 * ⚠️ LA LISTE EST LUE SUR LE SERVEUR, JAMAIS ÉCRITE ICI. L'écran en tenait une
 * copie en dur — cinq noms — pendant que le serveur tenait la sienne. Deux
 * listes pour une seule vérité : une variable ajoutée côté serveur n'aurait
 * jamais eu de bouton, et personne ne s'en serait aperçu. Le catalogue vit dans
 * `server/src/campagnes/variables.ts`, avec le format de chaque valeur.
 *
 * ⚠️ « PAS CHARGÉES » N'EST PAS « AUCUNE ». Si la lecture échoue, l'écran le dit
 * et rappelle qu'on peut écrire un marqueur à la main — le serveur les connaît
 * toujours. Un bloc vide laisserait croire que la fonction n'existe pas.
 */

export interface VariableAffichee {
  nom: string;
  libelle: string;
  groupe: string;
}

type Etat =
  | { type: 'chargement' }
  | { type: 'pret'; variables: VariableAffichee[] }
  | { type: 'echec' };

interface Props {
  /** Appelé avec le nom de la variable ; le parent l'insère au curseur. */
  onInserer: (nom: string) => void;
  /** Où ira l'insertion, pour le dire à côté des boutons. */
  cible: 'sujet' | 'corps';
}

export function VariablesCampagne({ onInserer, cible }: Props) {
  const [etat, setEtat] = useState<Etat>({ type: 'chargement' });

  useEffect(() => {
    let vivant = true;
    fetch('/api/campagnes/variables', { credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as { variables?: VariableAffichee[] };
        if (vivant) setEtat({ type: 'pret', variables: d.variables ?? [] });
      })
      .catch(() => {
        if (vivant) setEtat({ type: 'echec' });
      });
    return () => {
      vivant = false;
    };
  }, []);

  if (etat.type === 'chargement') {
    return <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">Chargement des variables…</p>;
  }

  if (etat.type === 'echec') {
    return (
      <p className="mt-2 text-xs text-orange-700 dark:text-orange-400">
        Les variables n&apos;ont pas pu être chargées. Vous pouvez toujours les écrire à la main,
        par exemple <code className="font-mono">{'{{nom_entreprise}}'}</code> ou{' '}
        <code className="font-mono">{'{{dirigeant}}'}</code>.
      </p>
    );
  }

  // L'ordre des groupes est celui du catalogue : le premier vu passe en premier.
  const groupes: { nom: string; variables: VariableAffichee[] }[] = [];
  for (const v of etat.variables) {
    let g = groupes.find((x) => x.nom === v.groupe);
    if (!g) groupes.push((g = { nom: v.groupe, variables: [] }));
    g.variables.push(v);
  }

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-gray-600 dark:text-gray-400">
        Variables de la fiche client — cliquez pour insérer à l&apos;endroit du curseur, dans{' '}
        <strong>{cible === 'sujet' ? 'le sujet' : 'le corps'}</strong>. Une valeur absente de la
        fiche s&apos;efface ; vérifiez l&apos;aperçu avant d&apos;envoyer.
      </p>
      {groupes.map((g) => (
        <div key={g.nom} className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-gray-600 dark:text-gray-400 w-24 shrink-0">
            {g.nom}
          </span>
          {g.variables.map((v) => (
            <button
              key={v.nom}
              type="button"
              // Le bouton ne doit pas voler le focus : c'est la position du
              // curseur dans le champ qu'on veut garder.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInserer(v.nom)}
              title={`{{${v.nom}}}`}
              aria-label={`Insérer la variable ${v.libelle}`}
              className="text-xs px-2 py-1 rounded-sm bg-gray-100 dark:bg-gray-800 text-teal-700 dark:text-teal-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              {v.libelle}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
