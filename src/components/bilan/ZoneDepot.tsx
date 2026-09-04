import { useRef, type ReactNode } from 'react';
import { useDepotFichiers } from '../../hooks/useDepotFichiers';

/**
 * La zone visible d'un depot : un cadre en pointilles, un bouton, ce qu'on
 * veut au-dessus. Le geste lui-meme vit dans `useDepotFichiers` — un fichier
 * qui exporte a la fois un crochet et un composant casse le rafraichissement
 * a chaud de Vite, et eslint le signale.
 */

interface Props {
  onFichiers: (fichiers: File[]) => void;
  accept?: string;
  disabled?: boolean;
  /** Libellé du bouton, qui est aussi le nom accessible du geste. */
  libelle: string;
  children?: ReactNode;
}

/** La zone visible : un cadre en pointillés, un bouton, ce qu'on veut au-dessus. */
export function ZoneDepot({ onFichiers, accept, disabled = false, libelle, children }: Props) {
  const { survol, gestionnaires } = useDepotFichiers(onFichiers, disabled);
  const champ = useRef<HTMLInputElement>(null);

  return (
    <div
      {...gestionnaires}
      className={`rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
        survol
          ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      {children}
      <button
        type="button"
        onClick={() => champ.current?.click()}
        disabled={disabled}
        className="text-sm text-teal-600 dark:text-teal-400 hover:underline font-medium disabled:no-underline disabled:cursor-not-allowed"
      >
        {libelle}
      </button>
      <input
        ref={champ}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFichiers(Array.from(e.target.files));
          // Remettre à zéro : sans cela, choisir DEUX FOIS le même fichier ne
          // déclenche aucun `change` — la valeur n'a pas varié — et le second
          // envoi semble ignoré.
          e.target.value = '';
        }}
      />
    </div>
  );
}
