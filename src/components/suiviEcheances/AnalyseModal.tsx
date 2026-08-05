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
