/**
 * Le badge d'état du numéro de TVA.
 * ---------------------------------------------------------------------------
 * Purement dérivé : aucun état serveur, aucune requête. Tout le jugement vit
 * dans `tvaStatut.ts`, qui est testé — ce composant ne fait que le peindre.
 *
 * L'infobulle est celle d'`INPIStatusBadge`, recopiée : les messages font deux à
 * quatre phrases, et un `title` HTML les rendrait illisibles (pas de retour à la
 * ligne, apparition tardive, disparition au moindre mouvement).
 *
 * ⚠️ HUIT LIGNES DUPLIQUÉES, DETTE ASSUMÉE. Factoriser cette infobulle dans
 * `ui/` supposerait de toucher `INPIStatusBadge`, composant stable, pour un gain
 * nul dans cette livraison. À faire le jour où un troisième badge en aura besoin.
 */

import { useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, Info, Loader2, WifiOff } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { etatTva, type EntreeEtatTva, type IconeTva } from './tvaStatut';

const ICONES: Record<IconeTva, typeof Clock> = {
  horloge: Clock,
  coche: CheckCircle,
  alerte: AlertTriangle,
  reseau: WifiOff,
  chargement: Loader2,
};

export function TvaStatusBadge(props: EntreeEtatTva) {
  const [survol, setSurvol] = useState(false);
  const etat = etatTva(props);

  // Pas de numéro : rien à dire, donc pas de badge vide.
  if (!etat) return null;

  const Icone = ICONES[etat.icone];

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
    >
      <Badge variant={etat.variant} className="cursor-help gap-1">
        <Icone className={`w-3 h-3 ${etat.anime ? 'animate-spin' : ''}`} />
        {etat.texte}
        {etat.variant === 'orange' && <Info className="w-3 h-3 ml-0.5 opacity-60" />}
      </Badge>
      {survol && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-72 px-3 py-2 text-xs leading-relaxed text-white bg-gray-900 dark:bg-gray-700 rounded-lg shadow-lg pointer-events-none animate-in fade-in duration-150">
          {etat.infobulle}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
        </div>
      )}
    </div>
  );
}
