import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * Une pièce jointe, avec son aperçu au survol.
 * ---------------------------------------------------------------------------
 * Le geste que cet écran existe pour supprimer : télécharger un fichier, le
 * chercher dans le dossier des téléchargements, l'ouvrir, constater que ce
 * n'est pas le bon, recommencer. Sur un bilan qui porte quinze pièces, c'est
 * quinze allers-retours pour en trouver une.
 *
 * ⚠️ LE SURVOL NE SUFFIT PAS, ET C'EST POURQUOI IL Y A AUSSI `focus`. Un
 * aperçu qui n'apparaît qu'à la souris est invisible au clavier — et le
 * dépôt tient à son accessibilité (voir `Tabs.tsx`, `Modal.tsx`). Les deux
 * déclencheurs ouvrent le même panneau ; `Échap` et le départ du pointeur le
 * ferment.
 *
 * ⚠️ UNE URL DIRECTE, ET NON UN BLOB TÉLÉCHARGÉ EN MÉMOIRE. La première
 * version récupérait le fichier avec `storage.download()` puis en faisait une
 * `URL.createObjectURL`. Ça ne marchait pas, et pour une raison qui vaut d'être
 * écrite : la politique de sécurité de contenu ne déclare pas `frame-src`, qui
 * retombe donc sur `default-src 'self'` — un `<iframe src="blob:...">` pour un
 * PDF y est refusé net.
 *
 * `/api/storage/<bucket>/<chemin>` est sur la MÊME origine : l'image et le
 * cadre y sont autorisés sans toucher à la politique. La route sert déjà le bon
 * type MIME pour l'aperçu et garde `?telecharger` pour l'enregistrement — elle
 * a été écrite pour ces deux usages. En prime : rien à révoquer, rien à garder
 * en mémoire, et le navigateur met en cache.
 *
 * ⚠️ LE DÉLAI RESTE. Sans lui, traverser la liste à la souris demanderait le
 * fichier de chaque ligne effleurée au passage.
 *
 * ⚠️ LE PANNEAU EST EN `position: fixed`, PAS EN `absolute`. La fenêtre de
 * bilan défile ; un panneau en `absolute` appartient à ce conteneur et s'y
 * trouve rogné. Constaté à l'écran : sur une pièce en bas de liste, l'aperçu
 * s'ouvrait bel et bien — hors de la zone visible, donc nulle part. En `fixed`,
 * il échappe à tout rognage, au prix de coordonnées à calculer et d'une bascule
 * vers le haut quand la place manque en dessous.
 */

/** Le délai avant de considérer qu'un survol est une intention, pas un passage. */
const DELAI_SURVOL_MS = 350;

/** Le bucket des pièces d'un bilan — checklist et diverses partagent le même. */
const BUCKET = 'bilan-checklist-attachments';

export interface PieceJointe {
  id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string;
  created_at?: string;
}

interface Props {
  piece: PieceJointe;
  onTelecharger: (piece: PieceJointe) => void;
  onSupprimer: (piece: PieceJointe) => void;
}

function formaterTaille(octets: number | null): string {
  if (octets == null) return '';
  // « 0 Ko » se lit comme un fichier vide, donc comme une panne. Sous le kilo-
  // octet on le dit autrement.
  if (octets < 1024) return '< 1 Ko';
  return octets < 1024 * 1024
    ? `${Math.round(octets / 1024)} Ko`
    : `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Hauteur du panneau, marge comprise : sert à décider s'il tient en dessous. */
const HAUTEUR_APERCU = 340;

/** Ce que le navigateur sait rendre seul dans un cadre : images et PDF. */
function estApercevable(mime: string | null): boolean {
  if (!mime) return false;
  return mime.startsWith('image/') || mime === 'application/pdf';
}

export function PieceJointeLigne({ piece, onTelecharger, onSupprimer }: Props) {
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ligne = useRef<HTMLDivElement>(null);
  const ouvert = position !== null;

  const apercevable = estApercevable(piece.mime_type);
  const estImage = piece.mime_type?.startsWith('image/') ?? false;
  const url = supabase.storage.from(BUCKET).getPublicUrl(piece.storage_path).data.publicUrl;

  function ouvrir() {
    if (!apercevable) return;
    if (minuterie.current) clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => {
      const cadre = ligne.current?.getBoundingClientRect();
      if (!cadre) return;
      const placeEnDessous = window.innerHeight - cadre.bottom;
      setPosition({
        top:
          placeEnDessous >= HAUTEUR_APERCU
            ? cadre.bottom + 4
            : Math.max(8, cadre.top - HAUTEUR_APERCU - 4),
        left: cadre.left,
        width: cadre.width,
      });
    }, DELAI_SURVOL_MS);
  }

  function fermer() {
    if (minuterie.current) clearTimeout(minuterie.current);
    setPosition(null);
  }

  useEffect(() => () => {
    if (minuterie.current) clearTimeout(minuterie.current);
  }, []);

  return (
    <div
      ref={ligne}
      className="group/att"
      onMouseEnter={ouvrir}
      onMouseLeave={fermer}
      onFocus={ouvrir}
      onBlur={fermer}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && ouvert) {
          e.stopPropagation(); // ne pas fermer la fenêtre entière
          fermer();
        }
      }}
    >
      <div className="flex items-center gap-2 py-1.5 px-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-xs">
        {estImage ? (
          <ImageIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        ) : (
          <FileText className="w-3.5 h-3.5 text-red-500 shrink-0" />
        )}
        <span
          className="truncate text-gray-700 dark:text-gray-300 flex-1 font-medium"
          title={piece.file_name}
        >
          {piece.file_name}
        </span>
        <span className="text-gray-400 dark:text-gray-500 shrink-0">
          {formaterTaille(piece.file_size)}
        </span>
        <button
          type="button"
          className="p-1 rounded-md hover:bg-teal-100 dark:hover:bg-teal-950/30 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
          onClick={() => onTelecharger(piece)}
          aria-label={`Télécharger ${piece.file_name}`}
          title="Télécharger"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover/att:opacity-100 focus:opacity-100"
          onClick={() => onSupprimer(piece)}
          aria-label={`Supprimer ${piece.file_name}`}
          title="Supprimer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {ouvert && apercevable && position && (
        <div
          // `pointer-events-none` : le panneau ne doit jamais intercepter la
          // souris, sinon il se place sous le pointeur, la ligne perd le survol,
          // le panneau se ferme — et rouvre. Un clignotement sans fin.
          className="fixed z-[60] pointer-events-none"
          style={{ top: position.top, left: position.left, width: position.width }}
          role="tooltip"
        >
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
            {estImage ? (
              <img
                src={url}
                alt={`Aperçu de ${piece.file_name}`}
                className="w-full max-h-80 object-contain bg-gray-50 dark:bg-gray-800"
              />
            ) : (
              <iframe
                src={url}
                title={`Aperçu de ${piece.file_name}`}
                className="w-full h-80 bg-gray-50 dark:bg-gray-800"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
