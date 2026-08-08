import { useCallback, useEffect, useState } from 'react';
import { Download, Loader, RefreshCw, Scale } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { downloadStatutsForClient } from '../../lib/inpiService';
import { chargerStatuts, type ClientPourStatuts, type EtatStatuts } from '../../lib/statutsService';
import type { DepotStatuts } from '../../lib/statuts';

/**
 * Les statuts déposés au greffe, résumés sur la fiche client.
 * ---------------------------------------------------------------------------
 * ⚠️ CETTE CARTE SAIT DISPARAÎTRE, et c'est sa règle la plus importante : une
 * société sans statuts au registre ne doit pas montrer un encart vide. Mais
 * elle ne disparaît QUE lorsqu'on sait qu'il n'y a rien. Si l'INPI n'a pas
 * répondu, elle reste et le dit — sans quoi une panne serait indiscernable
 * d'une absence, et personne ne va vérifier une absence.
 *
 * Le résumé est FACTUEL : il porte sur les dépôts (quels statuts, quand, combien
 * de fois modifiés), pas sur le contenu du PDF. Le produit n'a plus aucune IA,
 * et de toute façon le document n'est jamais conservé — il se télécharge à la
 * volée depuis le registre.
 *
 * Ce qui n'est PAS répété ici : forme juridique, capital, SIREN. La section
 * « Informations generales », deux colonnes à gauche, les affiche déjà.
 */

interface ClientStatutsCardProps {
  client: ClientPourStatuts & { nom_entreprise?: string | null };
}

function formaterDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR');
}

function LigneDepot({ depot, principal }: { depot: DepotStatuts; principal?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      {/* Le libelle passe a la ligne, il n'est pas tronque : `act_type` porte
          « Statuts mis a jour - Transfert du siege social », et c'est la partie
          coupee qui distingue un depot d'un autre. */}
      <span
        className={`text-sm ${
          principal
            ? 'text-gray-900 dark:text-gray-100'
            : 'text-gray-600 dark:text-gray-400'
        }`}
      >
        {depot.libelle}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
        {formaterDate(depot.date)}
      </span>
    </div>
  );
}

export function ClientStatutsCard({ client }: ClientStatutsCardProps) {
  const { showToast } = useToast();
  const [etat, setEtat] = useState<EtatStatuts | null>(null);
  const [telechargement, setTelechargement] = useState(false);
  const [toutVoir, setToutVoir] = useState(false);
  /** Motif du dernier refus de téléchargement, affiché tant qu'il vaut. */
  const [indisponible, setIndisponible] = useState<string | null>(null);

  const charger = useCallback(() => {
    let annule = false;
    setEtat(null);
    void chargerStatuts(client)
      .then((r) => {
        if (!annule) setEtat(r);
      })
      .catch((e) => {
        // En principe hors d'atteinte : `chargerStatuts` rattrape tout et rend un
        // etat. Mais un rejet non traite laisserait la carte sur son spinner a
        // vie — la meme panne muette que l'on refuse ailleurs, sous une autre
        // forme. Une garantie coute trois lignes.
        if (!annule) {
          setEtat({
            etat: 'erreur',
            message: e instanceof Error ? e.message : 'Erreur inattendue',
          });
        }
      });
    return () => {
      annule = true;
    };
  }, [client]);

  // `client` est recréé à chaque rendu du parent : on ne dépend que de ce qui
  // change vraiment la réponse, sous peine de rappeler l'INPI en boucle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(charger, [client.id, client.siren, client.siret, client.last_legal_sync]);

  async function telecharger() {
    setTelechargement(true);
    setIndisponible(null);
    try {
      const r = await downloadStatutsForClient(client.id, client.nom_entreprise || 'client');
      // Le message vient du serveur — « Aucun statut depose au registre » compris,
      // qui reste possible malgré une carte visible : le serveur relit les pieces
      // EN DIRECT au telechargement, la carte s'appuie sur ce qui a ete releve.
      // On l'affiche tel quel plutot que de le reecrire.
      showToast(r.message, r.success ? 'success' : 'error');
      // Le motif RESTE sous le bouton. Un bandeau disparait au bout de cinq
      // secondes ; la carte, elle, continuerait d'annoncer des statuts que le
      // bouton refuse de livrer, et l'utilisateur recliquerait.
      if (!r.success) setIndisponible(r.message);
    } finally {
      setTelechargement(false);
    }
  }

  // On ne sait pas encore : la carte entiere, avec son en-tete, pour que la
  // colonne ne saute pas quand la reponse arrive.
  if (etat === null) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 mb-4">
            <Scale className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Statuts</h2>
          </div>
          <div className="flex items-center justify-center py-4">
            <Loader className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Les deux seuls cas ou l'on sait qu'il n'y a rien a montrer.
  if (etat.etat === 'aucun' || etat.etat === 'sans-siren') return null;

  if (etat.etat === 'erreur') {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Statuts</h2>
          </div>
          <p className="text-sm text-orange-600 dark:text-orange-400">
            Le registre n a pas pu etre consulte : {etat.message}
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Cette societe a peut-etre des statuts deposes — on ne sait pas.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={charger}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Reessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { resume, releveLe } = etat;
  const visibles = toutVoir ? resume.depots : resume.depots.slice(0, 3);

  return (
    <Card>
      <CardContent className="py-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <Scale className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Statuts</h2>
          </div>
          <Badge variant={resume.nbModifications > 0 ? 'info' : 'gray'}>
            {resume.nbModifications > 0 ? 'Mis a jour' : 'D origine'}
          </Badge>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-gray-500 dark:text-gray-400">Statuts constitutifs</dt>
            <dd className="tabular-nums text-gray-900 dark:text-gray-100">
              {formaterDate(resume.constitutifs.date)}
            </dd>
          </div>
          {resume.nbModifications > 0 && (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">Derniere version</dt>
                <dd className="tabular-nums text-gray-900 dark:text-gray-100">
                  {formaterDate(resume.derniereVersion.date)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-gray-500 dark:text-gray-400">Modifications</dt>
                <dd className="text-gray-900 dark:text-gray-100">
                  {resume.nbModifications} depuis la creation
                </dd>
              </div>
            </>
          )}
        </dl>

        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-white/[0.06] divide-y divide-gray-100 dark:divide-gray-800">
          {visibles.map((d) => (
            <LigneDepot key={d.id} depot={d} principal={d.id === resume.derniereVersion.id} />
          ))}
        </div>
        {resume.depots.length > 3 && (
          <button
            type="button"
            onClick={() => setToutVoir((v) => !v)}
            className="mt-2 text-xs text-teal-700 dark:text-teal-400 hover:underline"
          >
            {toutVoir
              ? 'Voir moins'
              : `Voir les ${resume.depots.length} depots`}
          </button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="mt-4 w-full"
          onClick={() => void telecharger()}
          disabled={telechargement}
        >
          <Download className="w-4 h-4 mr-2" />
          {telechargement ? 'Telechargement...' : 'Telecharger les statuts'}
        </Button>

        {indisponible && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            {indisponible} Le depot reste inscrit au registre : consultable sur data.inpi.fr.
          </p>
        )}

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Registre national des entreprises{releveLe ? ` — releve du ${formaterDate(releveLe)}` : ''}
        </p>
      </CardContent>
    </Card>
  );
}
