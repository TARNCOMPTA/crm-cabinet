/**
 * Le bouton « Chercher dans l'annuaire » de l'adresse de facturation.
 * ---------------------------------------------------------------------------
 * Va chercher l'adresse publiée pour le SIREN de la fiche, et propose de la
 * renseigner. Ce qu'il faut proposer — renseigner, remplacer, faire choisir, ou
 * ne rien proposer du tout — est décidé par `lib/annuaireFacturation.ts`, qui
 * est pur et testé : ici il n'y a que de l'affichage et un clic.
 *
 * ⚠️ IL EXISTE EN LECTURE COMME EN ÉDITION, ET CE N'EST PAS DU CONFORT.
 * Le bouton de vérification TVA n'a longtemps existé qu'en édition : pour
 * vérifier un numéro il fallait passer la fiche en modification, deviner que la
 * commande s'y trouvait, puis en ressortir. Signalé le 2026-09-05 sous la forme
 * « le connecteur VIES ne marche pas » — il marchait, il était introuvable. On
 * ne refait pas la même chose une semaine plus tard.
 *
 *   en édition  choisir une adresse REMPLIT le champ ; c'est le bouton
 *               « Enregistrer » de la fiche qui écrit, par le chemin normal
 *   en lecture   choisir une adresse ÉCRIT tout de suite, puis recharge — sans
 *               quoi il n'y aurait aucun moyen d'agir depuis la fiche ouverte
 *
 * ⚠️ REMPLACER UNE ADRESSE EXISTANTE DEMANDE UN SECOND CLIC, dans les deux
 * modes. L'adresse en place a été saisie par le cabinet d'après un courrier du
 * client ; la remplacer à tort ferait partir les factures suivantes ailleurs,
 * sans que personne ne le voie avant une réclamation. Les deux valeurs sont
 * montrées côte à côte : une confirmation qui ne dit pas ce qu'on perd ne fait
 * rien décider, elle fait cliquer.
 */

import { useState } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { normaliserAdresseFacturation } from '../../lib/facturationElectronique';
import {
  chercherAdresseAnnuaire,
  propositionAnnuaire,
  type AdresseAnnuaire,
  type Proposition,
} from '../../lib/annuaireFacturation';

interface Props {
  clientId: string;
  /** Le SIREN de la fiche : sans lui l'annuaire ne peut pas être interrogé. */
  siren: string | null | undefined;
  /**
   * L'adresse à comparer — la valeur EN COURS DE SAISIE en édition, celle de la
   * fiche en lecture. Voir `propositionAnnuaire`.
   */
  adresseActuelle: string | null | undefined;
  /**
   * Édition : remplit le champ, sans rien écrire.
   * Absent en lecture, où le composant écrit lui-même.
   */
  onRemplir?: (identifiant: string) => void;
  /** Lecture : appelé après une écriture, pour recharger la fiche. */
  onEnregistre?: () => void;
}

export function AdresseFacturationAnnuaire({
  clientId,
  siren,
  adresseActuelle,
  onRemplir,
  onEnregistre,
}: Props) {
  const { showToast } = useToast();
  const [enCours, setEnCours] = useState(false);
  const [proposition, setProposition] = useState<Proposition | null>(null);

  const sirenPropre = (siren ?? '').replace(/[^0-9]/g, '');
  const interrogeable = sirenPropre.length === 9;

  async function chercher() {
    setEnCours(true);
    setProposition(null);
    try {
      const r = await chercherAdresseAnnuaire(clientId);
      const p = propositionAnnuaire(r, adresseActuelle);
      setProposition(p);
      // « rien » et « identique » n'ouvrent aucune action : le toast est la
      // seule chose qui se passe, et il doit donc porter le message du serveur
      // — c'est lui qui distingue « pas inscrit » de « annuaire injoignable ».
      if (p.genre === 'rien') showToast(p.message, 'warning');
      if (p.genre === 'identique') {
        showToast('L’annuaire confirme l’adresse déjà enregistrée sur la fiche.', 'success');
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Recherche impossible.', 'error');
    } finally {
      setEnCours(false);
    }
  }

  async function retenir(identifiant: string) {
    const valeur = normaliserAdresseFacturation(identifiant);

    if (onRemplir) {
      // Édition : on ne touche pas à la base. La fiche s'enregistre par son
      // propre bouton, avec la même normalisation que tout le reste.
      onRemplir(valeur);
      setProposition(null);
      showToast('Adresse reportée dans le champ. Enregistrez la fiche pour la conserver.', 'info');
      return;
    }

    setEnCours(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ adresse_facturation_electronique: valeur })
        .eq('id', clientId);
      // ⚠️ `error` EST VÉRIFIÉ. `CompanyToOfficerTab` ne le faisait pas et
      // annonçait « enregistré » sur un échec — le défaut corrigé en 96c9896.
      if (error) throw error;
      setProposition(null);
      showToast('Adresse de facturation électronique enregistrée.', 'success');
      onEnregistre?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Enregistrement impossible.', 'error');
    } finally {
      setEnCours(false);
    }
  }

  function ligneAdresse(a: AdresseAnnuaire) {
    return (
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-mono text-sm">{a.identifiant}</span>
        {a.nom && <span className="text-xs text-gray-600 dark:text-gray-400">{a.nom}</span>}
        {a.ville && <span className="text-xs text-gray-500 dark:text-gray-500">{a.ville}</span>}
      </span>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => void chercher()}
        disabled={!interrogeable || enCours}
        title={
          interrogeable
            ? 'Chercher l’adresse publiée pour ce SIREN dans l’annuaire de la facturation électronique. Rien ne part sans ce clic, et seul le SIREN sort.'
            : 'Renseignez le SIREN de la fiche : l’annuaire s’interroge par SIREN.'
        }
      >
        {enCours ? (
          <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
        ) : (
          <BookOpen className="w-4 h-4 mr-1.5" />
        )}
        {enCours ? 'Recherche…' : 'Chercher dans l’annuaire'}
      </Button>

      {proposition?.genre === 'a-renseigner' && (
        <div className="rounded-md border border-teal-200 bg-teal-50 p-3 dark:border-teal-900 dark:bg-teal-950/30">
          <p className="text-sm text-gray-700 dark:text-gray-300">Adresse trouvée dans l’annuaire :</p>
          <div className="mt-1">{ligneAdresse(proposition.adresse)}</div>
          <Button
            className="mt-2"
            size="sm"
            onClick={() => void retenir(proposition.adresse.identifiant)}
            disabled={enCours}
          >
            Utiliser cette adresse
          </Button>
        </div>
      )}

      {proposition?.genre === 'a-remplacer' && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30"
        >
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            La fiche porte déjà une autre adresse.
          </p>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-gray-600 dark:text-gray-400">Sur la fiche :</dt>
              <dd className="font-mono">{proposition.actuelle}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-gray-600 dark:text-gray-400">Dans l’annuaire :</dt>
              <dd>{ligneAdresse(proposition.adresse)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
            Celle de la fiche a pu être communiquée directement par le client, et rester la bonne.
            Ne la remplacez que si vous savez laquelle fait foi.
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void retenir(proposition.adresse.identifiant)}
              disabled={enCours}
            >
              Remplacer par celle de l’annuaire
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setProposition(null)}>
              Garder celle de la fiche
            </Button>
          </div>
        </div>
      )}

      {proposition?.genre === 'choix' && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Plusieurs adresses actives sont publiées.
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            Choisissez celle que le client vous a indiquée : nous ne pouvons pas deviner laquelle
            reçoit vos factures.
          </p>
          <ul className="mt-2 space-y-2">
            {proposition.adresses.map((a) => (
              <li key={a.identifiant} className="flex flex-wrap items-center gap-2">
                {ligneAdresse(a)}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void retenir(a.identifiant)}
                  disabled={enCours}
                  aria-label={`Utiliser l’adresse ${a.identifiant}`}
                >
                  Utiliser
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
