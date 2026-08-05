/**
 * L'adresse d'une fiche client, en lecture et en édition.
 * ---------------------------------------------------------------------------
 * Sortie de `ClientDetail` parce qu'elle porte deux boutons d'assistance, un
 * appel réseau et un repli — soit plus d'état que ce qu'une ligne de tableau
 * peut décemment contenir en ligne.
 *
 * ⚠️ LE BLOC DE LECTURE EST COMPOSÉ DEPUIS LES COMPOSANTS, pas depuis
 * `client.adresse`. L'affichage ne dépend donc plus du déclencheur : ce que
 * l'utilisateur vient de saisir apparaît immédiatement, sans décalage entre la
 * saisie et le rechargement.
 *
 * ⚠️ REPLI OBLIGATOIRE : si les composants sont tous vides et que `adresse` ne
 * l'est pas — une fiche que le remplissage n'a pas su découper — on affiche le
 * texte tel quel. C'est ce repli qui rend cet écran livrable quel que soit
 * l'état du remplissage, et il doit rester.
 */

import { useState } from 'react';
import { Sparkles, Scissors } from 'lucide-react';
import { Input } from '../ui/Input';
import { useToast } from '../../contexts/ToastContext';
import { composerAdresse, decouperAdresse } from '../../lib/adresseHeritee';

export interface ComposantsAdresse {
  adresse_ligne1?: string | null;
  adresse_complement?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  pays?: string | null;
  code_insee?: string | null;
}

const GEO_API = 'https://geo.api.gouv.fr';

function aDesComposants(c: ComposantsAdresse): boolean {
  return Boolean(
    (c.adresse_ligne1 ?? '').trim() ||
      (c.code_postal ?? '').trim() ||
      (c.ville ?? '').trim() ||
      (c.adresse_complement ?? '').trim()
  );
}

/**
 * Le bloc postal, tel qu'on l'écrit sur une enveloppe. Une adresse se lit en
 * bloc, pas en cinq lignes de tableau.
 */
export function AdresseLecture({
  composants,
  adresseHeritee,
}: {
  composants: ComposantsAdresse;
  adresseHeritee: string | null | undefined;
}) {
  if (!aDesComposants(composants)) {
    const texte = (adresseHeritee ?? '').trim();
    return texte ? (
      <span className="text-sm text-gray-900 dark:text-gray-100">{texte}</span>
    ) : (
      <span className="text-gray-400 dark:text-gray-500">-</span>
    );
  }

  const cpVille = [composants.code_postal, composants.ville]
    .map((v) => (v ?? '').trim())
    .filter(Boolean)
    .join(' ');
  const pays = (composants.pays ?? '').trim();

  return (
    <div className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">
      {composants.adresse_ligne1 && <div>{composants.adresse_ligne1}</div>}
      {composants.adresse_complement && <div>{composants.adresse_complement}</div>}
      {cpVille && <div>{cpVille}</div>}
      {/* La France n'est pas écrite : c'est l'implicite d'un cabinet français. */}
      {pays && pays.toUpperCase() !== 'FRANCE' && <div>{pays}</div>}
    </div>
  );
}

interface PropsEdition {
  composants: ComposantsAdresse;
  adresseHeritee: string | null | undefined;
  onChange: (champs: Partial<ComposantsAdresse>) => void;
}

export function AdresseEdition({ composants, adresseHeritee, onChange }: PropsEdition) {
  const { showToast } = useToast();
  const [recherche, setRecherche] = useState(false);

  const cp = (composants.code_postal ?? '').trim();
  const ville = (composants.ville ?? '').trim();
  const texteHerite = (adresseHeritee ?? '').trim();

  /**
   * « Découper » est la porte de sortie des fiches que le remplissage SQL n'a
   * pas su traiter. Sans elle, la seule issue serait un ticket et du SQL à la
   * main. L'utilisateur voit le résultat proposé et valide : rien n'est écrit
   * sans son enregistrement.
   */
  const peutDecouper = !aDesComposants(composants) && texteHerite !== '';

  /** « Auto » complète la ville et le code INSEE depuis un code postal. */
  const peutCompleter = /^\d{5}$/.test(cp) && ville === '';

  async function completerDepuisCodePostal() {
    setRecherche(true);
    try {
      const rep = await fetch(`${GEO_API}/communes?codePostal=${cp}&fields=nom,code`);
      const communes = (await rep.json()) as { nom?: string; code?: string }[];
      if (!Array.isArray(communes) || communes.length === 0) {
        showToast(`Aucune commune connue pour le code postal ${cp}`, 'warning');
        return;
      }
      // Plusieurs communes partagent un code postal : on prend la première et on
      // le dit, plutôt que d'ouvrir une liste pour un champ qui se corrige à la
      // main en deux secondes.
      const [premiere] = communes;
      onChange({ ville: premiere?.nom ?? '', code_insee: premiere?.code ?? '' });
      showToast(
        communes.length > 1
          ? `${communes.length} communes pour ce code postal : « ${premiere?.nom} » proposee, corrigez si besoin.`
          : `Commune trouvee : ${premiere?.nom}`,
        communes.length > 1 ? 'warning' : 'success'
      );
    } catch {
      showToast('Service adresse injoignable.', 'error');
    } finally {
      setRecherche(false);
    }
  }

  function decouper() {
    const d = decouperAdresse(texteHerite);
    onChange({
      adresse_ligne1: d.ligne1,
      code_postal: d.codePostal,
      ville: d.ville,
      pays: d.codePostal ? 'France' : null,
    });
    showToast(
      d.codePostal
        ? 'Adresse decoupee. Verifiez puis enregistrez.'
        : "Aucun code postal reconnu : tout est alle dans la ligne d'adresse.",
      d.codePostal ? 'success' : 'warning'
    );
  }

  return (
    <div className="space-y-2 w-full">
      <Input
        label="Adresse"
        value={composants.adresse_ligne1 ?? ''}
        onChange={(e) => onChange({ adresse_ligne1: e.target.value })}
        placeholder="12 RUE de l Exemple"
      />
      <Input
        label="Complement"
        value={composants.adresse_complement ?? ''}
        onChange={(e) => onChange({ adresse_complement: e.target.value })}
        placeholder="Batiment B, 2e etage"
      />

      <div className="flex gap-2 items-end">
        <div className="w-28">
          <Input
            label="Code postal"
            value={composants.code_postal ?? ''}
            onChange={(e) => onChange({ code_postal: e.target.value })}
            placeholder="81120"
          />
        </div>
        <div className="flex-1">
          <Input
            label="Ville"
            value={composants.ville ?? ''}
            onChange={(e) => onChange({ ville: e.target.value })}
            placeholder="Villeneuve"
          />
        </div>
        {peutCompleter && (
          <button
            type="button"
            onClick={() => void completerDepuisCodePostal()}
            disabled={recherche}
            className="mb-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800"
            title="Completer la ville et le code INSEE depuis le code postal"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {recherche ? '...' : 'Auto'}
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            label="Pays"
            value={composants.pays ?? ''}
            onChange={(e) => onChange({ pays: e.target.value })}
            placeholder="France"
          />
        </div>
        <div className="w-32">
          <Input
            label="Code INSEE"
            value={composants.code_insee ?? ''}
            onChange={(e) => onChange({ code_insee: e.target.value })}
          />
        </div>
      </div>

      {peutDecouper && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-xs text-amber-900 dark:text-amber-200">
            Cette fiche porte une adresse en une seule ligne, que le decoupage
            automatique n&apos;a pas su traiter :
          </p>
          <p className="text-xs font-mono mt-1 text-amber-900 dark:text-amber-200">{texteHerite}</p>
          <button
            type="button"
            onClick={decouper}
            className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800"
          >
            <Scissors className="w-3.5 h-3.5" />
            Decouper
          </button>
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400">
        L&apos;adresse en une ligne est recomposee automatiquement :{' '}
        <span className="font-mono">
          {composerAdresse({
            ligne1: composants.adresse_ligne1,
            complement: composants.adresse_complement,
            codePostal: composants.code_postal,
            ville: composants.ville,
            pays: composants.pays,
          }) || '—'}
        </span>
      </p>
    </div>
  );
}
