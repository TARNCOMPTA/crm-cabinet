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
import { verifierNumeroTva, verifierTvaIntracom } from '../../lib/tvaService';
import { verificationADemander } from '../../lib/tva';

interface Props {
  clientId: string;
  /** Le numéro ENREGISTRÉ, celui que la route relira en base. */
  numero: string | null | undefined;
  /**
   * Le numéro en cours de saisie, quand le champ est ouvert à l'édition.
   *
   * ⚠️ SANS LUI, LE BOUTON MENT EN ÉDITION. La route relit `tva_intracom` DEPUIS
   * LA BASE ; taper un nouveau numéro puis cliquer « Vérifier » avant
   * d'enregistrer vérifiait donc l'ANCIEN, et affichait son verdict sous le
   * nouveau. Quand les deux diffèrent, on bascule sur le contrôle ponctuel, qui
   * interroge VIES sur le numéro saisi sans rien écrire — le verdict ne
   * s'enregistre qu'une fois la fiche sauvegardée, et le message le dit.
   */
  numeroSaisi?: string | null;
  /**
   * Appelé après un verdict ENREGISTRÉ, pour recharger la fiche. Pas appelé sur
   * une indisponibilité : rien n'a changé en base, un rechargement n'apporterait
   * que du clignotement.
   */
  onVerified: () => void;
  /** Signale l'indisponibilité au parent, qui la garde en état transitoire. */
  onIndisponible?: (indisponible: boolean) => void;
}

export function TvaVerifyButton({ clientId, numero, numeroSaisi, onVerified, onIndisponible }: Props) {
  const { showToast } = useToast();
  const [enCours, setEnCours] = useState(false);

  // La règle vit dans `src/lib/tva.ts`, avec ses tests : elle décide seule
  // lequel des deux appels faire, et sur quel numéro.
  const { numero: aVerifier, enregistrable } = verificationADemander(numero, numeroSaisi);
  const nonEnregistre = !enregistrable;

  async function verifier() {
    setEnCours(true);
    onIndisponible?.(false);
    try {
      const r = nonEnregistre
        ? await verifierNumeroTva(aVerifier)
        : await verifierTvaIntracom(clientId);

      if (r.statut === 'indisponible') {
        // PAS une erreur : le service n'a pas repondu, le numero n'est pas en
        // cause, et le statut precedent reste en base.
        onIndisponible?.(true);
        showToast(r.message, 'warning');
        return;
      }

      // « invalide » n'est pas une erreur non plus : c'est un verdict, et il est
      // frequent pour une entreprise en franchise en base de TVA.
      showToast(
        nonEnregistre
          ? `${r.message} (Numero non encore enregistre : le verdict ne sera retenu qu'apres sauvegarde.)`
          : r.message,
        r.statut === 'valide' ? 'success' : 'warning'
      );
      // Rien n'a ete ecrit sur un controle ponctuel : recharger la fiche
      // ecraserait la saisie en cours par ce qui est encore en base.
      if (!nonEnregistre) onVerified();
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
      disabled={!aVerifier || enCours}
      title={
        !aVerifier
          ? 'Renseignez un numéro, ou un SIREN pour qu’il soit calculé.'
          : nonEnregistre
            ? 'Contrôler ce numéro auprès du registre européen VIES. Il n’est pas encore enregistré : le verdict ne sera pas retenu.'
            : 'Interroger le registre européen VIES. Rien ne part sans ce clic.'
      }
    >
      {enCours ? (
        <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
      ) : (
        <ShieldCheck className="w-4 h-4 mr-1.5" />
      )}
      {enCours ? 'Vérification…' : 'Vérifier'}
    </Button>
  );
}
