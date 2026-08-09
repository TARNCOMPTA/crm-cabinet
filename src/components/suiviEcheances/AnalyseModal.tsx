/**
 * Déclenchement d'une analyse.
 * ---------------------------------------------------------------------------
 * Cet écran ne PROTÈGE rien : le serveur refuse l'appel à un non-administrateur,
 * force le mode prudent, borne la période et écrit l'audit avant d'appeler.
 * Ce qui est ici sert à une seule chose — que personne ne clique sans savoir ce
 * qu'il déclenche.
 *
 * Et ce qu'on déclenche n'est pas anodin : lire un accusé le marque « récupéré »
 * chez jedeclare. Le logiciel qui dépose les flux du cabinet peut alors ne plus
 * le voir comme nouveau. D'où l'avertissement, en toutes lettres, avant le
 * bouton — et non après.
 */

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import type { BilanAnalyse } from '../../lib/jedeclareService';

interface Props {
  ouvert: boolean;
  onFermer: () => void;
  debut: string;
  fin: string;
  procedure: string;
  teleprocedures: Record<string, string>;
  onLancer: (demande: {
    debut: string;
    fin: string;
    procedure?: string;
    limite: number;
  }) => Promise<BilanAnalyse>;
}

export function AnalyseModal({
  ouvert,
  onFermer,
  debut,
  fin,
  procedure,
  teleprocedures,
  onLancer,
}: Props) {
  const [d, setD] = useState(debut);
  const [f, setF] = useState(fin);
  const [p, setP] = useState(procedure);
  const [limite, setLimite] = useState(150);
  const [encours, setEncours] = useState(false);
  const [bilan, setBilan] = useState<BilanAnalyse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const lancer = async () => {
    setEncours(true);
    setErreur(null);
    setBilan(null);
    try {
      setBilan(await onLancer({ debut: d, fin: f, procedure: p, limite }));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'analyse a échoué.");
    } finally {
      setEncours(false);
    }
  };

  const fermer = () => {
    setBilan(null);
    setErreur(null);
    onFermer();
  };

  return (
    <Modal isOpen={ouvert} onClose={fermer} title="Analyser les accusés jedeclare" size="lg">
      <div className="space-y-5">
        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm text-amber-900 dark:text-amber-200 space-y-2">
            <p>
              Lire un accusé le marque <strong>« récupéré »</strong> chez jedeclare. Le logiciel
              avec lequel le cabinet dépose ses flux peut alors ne plus le considérer comme
              nouveau.
            </p>
            <p>
              Le CRM n’ouvre donc que les accusés <strong>déjà marqués récupérés</strong> — leur
              lecture ne change plus rien. Ce mode prudent n’est pas débrayable depuis cet écran.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Du" type="date" value={d} onChange={(e) => setD(e.target.value)} />
          <Input label="Au" type="date" value={f} onChange={(e) => setF(e.target.value)} />
          <Select label="Téléprocédure" value={p} onChange={(e) => setP(e.target.value)}>
            <option value="TOUTES">Toutes</option>
            {Object.entries(teleprocedures).map(([code, libelle]) => (
              <option key={code} value={code}>
                {libelle}
              </option>
            ))}
          </Select>
          <Input
            label="Accusés au maximum"
            type="number"
            min={1}
            max={500}
            value={limite}
            onChange={(e) => setLimite(Number(e.target.value))}
          />
        </div>

        {erreur && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {erreur}
          </p>
        )}

        {bilan && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-800/60">
            <Ligne libelle="Accusés trouvés" valeur={bilan.piecesTrouvees} />
            <Ligne libelle="Déjà en cache" valeur={bilan.dejaEnCache} />
            <Ligne libelle="Analysés" valeur={bilan.analysees} />
            <Ligne libelle="Déclarations enregistrées" valeur={bilan.declarationsEnregistrees} />
            <Ligne libelle="Illisibles" valeur={bilan.illisibles} />
            <Ligne libelle="Restants à traiter" valeur={bilan.restantes} />
            <Ligne
              libelle="Écartés par prudence"
              valeur={bilan.ecarteesPrudence}
              aide="Accusés jamais ouverts : les lire les marquerait."
            />
          </dl>
        )}

        {/* ⚠️ LA VENTILATION EST CE QUI REND LES TOTAUX DIAGNOSTICABLES.
            « 170 écartés par prudence » ne dit pas s'ils viennent d'un compte ou
            des deux. Un compte dont AUCUN accusé n'est récupéré par le logiciel
            de production voit 100 % de ses pièces écartées, à chaque analyse, et
            n'apparaît jamais dans le suivi — le total, lui, a seulement l'air
            partiel. */}
        {bilan?.parCompte && bilan.parCompte.length > 1 && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-2">Compte de flux</th>
                  <th className="px-4 py-2 text-right">Trouvés</th>
                  <th className="px-4 py-2 text-right">En cache</th>
                  <th className="px-4 py-2 text-right">Écartés</th>
                  <th className="px-4 py-2 text-right">À traiter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {bilan.parCompte.map((c) => (
                  <tr key={c.compte}>
                    <td className="px-4 py-2 text-gray-900 dark:text-gray-100 break-all">
                      {c.login}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.trouvees}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500 dark:text-gray-400">
                      {c.dejaEnCache}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        c.ecarteesPrudence > 0 && c.aTraiter === 0
                          ? 'text-orange-600 dark:text-orange-400 font-medium'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {c.ecarteesPrudence}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.aTraiter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {bilan.parCompte.some((c) => c.trouvees > 0 && c.aTraiter === 0 && c.dejaEnCache === 0) && (
              <p className="px-4 py-2 text-xs text-orange-600 dark:text-orange-400 border-t border-gray-200 dark:border-gray-700">
                Un compte dont rien n'est ni en cache ni à traiter n'alimentera jamais le suivi :
                ses accusés ne sont récupérés par aucun logiciel de production, et le mode prudent
                les écarte tous.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={fermer}>
            {bilan ? 'Fermer' : 'Annuler'}
          </Button>
          <Button onClick={lancer} disabled={encours}>
            {encours ? 'Analyse en cours...' : bilan ? 'Relancer' : 'Analyser'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Ligne({
  libelle,
  valeur,
  aide,
}: {
  libelle: string;
  valeur: number;
  aide?: string;
}) {
  return (
    <>
      <dt className="text-gray-600 dark:text-gray-400" title={aide}>
        {libelle}
      </dt>
      <dd className="text-right font-medium text-gray-900 dark:text-gray-100">{valeur}</dd>
    </>
  );
}
