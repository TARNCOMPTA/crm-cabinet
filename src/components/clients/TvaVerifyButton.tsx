/**
 * Le bouton « Vérifier » du numéro de TVA.
 * ---------------------------------------------------------------------------
 * `useState` LOCAL, et surtout PAS `useSyncJobs`. La raison est un défaut latent,
 * pas une préférence de style : `subscribeToCabinetSyncJobs` repose sur
 * `db.channel(...).on('postgres_changes', …)`, et `channel()` / `removeChannel()`
 * sont des TALONS INERTES dans `src/lib/supabase.ts` — il n'y a pas de temps réel
 * dans cette version.
 *
 * Conséquences si l'on passait par là : un travail resté « en cours » — onglet
 * fermé avant la clôture, ou créé par un autre poste — désactiverait ce bouton
 * DÉFINITIVEMENT, `hasActiveJob` ne voyant jamais sa fin. Pour une vérification
 * de deux secondes, c'est un risque de blocage sans contrepartie. Accessoirement,
 * la fin d'un travail diffuse un toast À L'ÉCHELLE DU CABINET : « Vérification
 * TVA terminée » pour tout le monde, sur un clic individuel.
 *
 * Le motif « lancer et oublier » de `INPISyncButton` reste le bon choix POUR LUI
 * — des dizaines de secondes, cinquante dirigeants à rapprocher — mais il ne se
 * transpose pas ici.
 */

import { useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../../contexts/ToastContext';
import { verifierTvaIntracom } from '../../lib/tvaService';

interface Props {
  clientId: string;
  numero: string | null | undefined;
  /**
   * Appelé après un verdict ENREGISTRÉ, pour recharger la fiche. Pas appelé sur
   * une indisponibilité : rien n'a changé en base, un rechargement n'apporterait
   * que du clignotement.
   */
  onVerified: () => void;
  /** Signale l'indisponibilité au parent, qui la garde en état transitoire. */
  onIndisponible?: (indisponible: boolean) => void;
}

export function TvaVerifyButton({ clientId, numero, onVerified, onIndisponible }: Props) {
  const { showToast } = useToast();
  const [enCours, setEnCours] = useState(false);

  async function verifier() {
    setEnCours(true);
    onIndisponible?.(false);
    try {
      const r = await verifierTvaIntracom(clientId);

      if (r.statut === 'indisponible') {
        // PAS une erreur : le service n'a pas repondu, le numero n'est pas en
        // cause, et le statut precedent reste en base.
        onIndisponible?.(true);
        showToast(r.message, 'warning');
        return;
      }

      // « invalide » n'est pas une erreur non plus : c'est un verdict, et il est
      // frequent pour une entreprise en franchise en base de TVA.
      showToast(r.message, r.statut === 'valide' ? 'success' : 'warning');
      onVerified();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Verification impossible.', 'error');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void verifier()}
      disabled={!numero || enCours}
      title={
        numero
          ? 'Interroger le registre europeen VIES. Rien ne part sans ce clic.'
          : 'Renseignez un numero, ou un SIREN pour qu il soit calcule.'
      }
    >
      {enCours ? (
        <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
      ) : (
        <ShieldCheck className="w-4 h-4 mr-1.5" />
      )}
      {enCours ? 'Verification...' : 'Verifier'}
    </Button>
  );
}
