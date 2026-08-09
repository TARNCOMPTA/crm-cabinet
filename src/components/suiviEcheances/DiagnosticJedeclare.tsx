import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader, RefreshCw, X } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { testerConnexion, type ResultatDiagnostic } from '../../lib/jedeclareService';

/**
 * Diagnostic jedeclare, compte par compte.
 * ---------------------------------------------------------------------------
 * ⚠️ CE PANNEAU EXISTE POUR UNE RAISON PRÉCISE : une requête jedeclare ne voit
 * que le compte qu'elle authentifie. Un cabinet qui dépose ses flux sous deux
 * comptes en voit donc la moitié si le second ne répond pas — et l'écran de
 * suivi paraît simplement incomplet. Rien ne distingue « ce mois n'a rien eu »
 * de « ce compte n'a pas répondu ».
 *
 * Le serveur teste chaque compte SÉPARÉMENT depuis toujours, exprès. Le résultat
 * n'était affiché nulle part : `testerConnexion()` l'aplatissait en `{ ok }`, et
 * aucun écran ne l'appelait.
 *
 * D'où la règle de cet affichage : UNE LIGNE PAR COMPTE, toujours, même quand
 * tout va bien. Un panneau qui ne montrerait que les erreurs laisserait croire
 * qu'un compte oublié dans le `.env` fonctionne — or un compte à moitié
 * renseigné est ignoré en silence par la configuration, et c'est précisément
 * ce cas-là qu'on cherche à rendre visible.
 */

function Ligne({
  titre,
  ok,
  mesure,
  detail,
}: {
  titre: string;
  ok: boolean;
  mesure?: string;
  detail?: string;
}) {
  return (
    <div className="py-2 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {ok ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
            {titre}
          </span>
        </div>
        {detail && (
          <p className="mt-1 ml-6 text-xs text-red-600 dark:text-red-400 break-words">{detail}</p>
        )}
      </div>
      {mesure && (
        <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
          {mesure}
        </span>
      )}
    </div>
  );
}

export function DiagnosticJedeclare({ onFermer }: { onFermer: () => void }) {
  const [resultat, setResultat] = useState<ResultatDiagnostic | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const lancer = useCallback(() => {
    let annule = false;
    setChargement(true);
    setErreur(null);
    testerConnexion()
      .then((r) => {
        if (!annule) setResultat(r);
      })
      .catch((e) => {
        if (!annule) setErreur(e instanceof Error ? e.message : 'Test impossible.');
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, []);

  useEffect(lancer, [lancer]);

  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Diagnostic jedeclare
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Chaque compte de flux est interrogé séparément. Lister ne marque rien.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={lancer} disabled={chargement}>
              <RefreshCw className={`w-4 h-4 ${chargement ? 'animate-spin' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onFermer}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {chargement && (
          <div className="flex items-center justify-center py-6">
            <Loader className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        )}

        {erreur && !chargement && (
          <p className="text-sm text-red-600 dark:text-red-400">{erreur}</p>
        )}

        {resultat && !chargement && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={resultat.nbComptes > 1 ? 'info' : 'gray'}>
                {resultat.nbComptes} compte{resultat.nbComptes > 1 ? 's' : ''} de flux
              </Badge>
              <span className="text-gray-500 dark:text-gray-400">
                éditeur <span className="font-mono">{resultat.editeur}</span> · logiciel{' '}
                <span className="font-mono">{resultat.logiciel}</span>
              </span>
            </div>

            {/* Le cas le plus courant, et le plus silencieux : le second compte
                n'a jamais ete declare. La configuration ignore un compte a
                moitie renseigne, sans rien dire. */}
            {resultat.nbComptes === 1 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Un seul compte est configuré. Si le cabinet dépose ses flux sous plusieurs
                  comptes, les autres sont invisibles ici comme dans le suivi.
                </p>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  Déclarez-les avec les suffixes <code className="font-mono">_2</code>,{' '}
                  <code className="font-mono">_3</code> :{' '}
                  <code className="font-mono">JEDECLARE_LOGIN_2</code>,{' '}
                  <code className="font-mono">JEDECLARE_MDP_2</code>. Un compte dont le mot de
                  passe manque est ignoré sans avertissement.
                </p>
              </div>
            )}

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {resultat.comptes.map((c) => (
                <Ligne
                  key={c.login}
                  titre={c.login}
                  ok={c.ok}
                  mesure={c.ok ? `${c.nbPieces ?? 0} pièce(s) hier` : undefined}
                  detail={c.detail}
                />
              ))}
            </div>

            <div className="pt-2 border-t border-gray-100 dark:border-white/[0.06] divide-y divide-gray-100 dark:divide-gray-800">
              <Ligne
                titre="Communication — comptes rendus"
                ok={resultat.communication.ok}
                mesure={
                  resultat.communication.ok
                    ? `${resultat.communication.nbPieces ?? 0} pièce(s)`
                    : undefined
                }
                detail={resultat.communication.detail}
              />
              {resultat.gestion.teste ? (
                <Ligne
                  titre="Gestion — dossiers clients"
                  ok={resultat.gestion.ok}
                  mesure={
                    resultat.gestion.ok ? `${resultat.gestion.nbDossiers ?? 0} dossier(s)` : undefined
                  }
                  detail={resultat.gestion.detail}
                />
              ) : (
                <p className="py-2 text-xs text-gray-500 dark:text-gray-400">
                  Gestion non testée : aucun{' '}
                  <code className="font-mono">JEDECLARE_ID_COMPTE</code> renseigné. Cet
                  identifiant ne sert qu'à lire la liste des dossiers, pas les comptes rendus.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
