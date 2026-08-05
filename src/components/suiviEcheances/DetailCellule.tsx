/**
 * Le détail d'une cellule : ce que jedeclare a constaté, et ce que le cabinet
 * en dit.
 *
 * Les deux blocs sont visuellement séparés parce qu'ils n'ont pas la même
 * autorité. À gauche un constat que personne ici ne peut modifier ; à droite un
 * suivi interne qui n'engage que le cabinet. Les confondre serait laisser croire
 * qu'on peut « valider » une déclaration rejetée par la DGFiP.
 */

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Badge } from '../ui/Badge';
import {
  STATUTS_INTERNES,
  moisCourt,
  type CelluleSuivi,
  type SocieteSuivie,
  type StatutInterne,
} from '../../lib/jedeclareService';

interface Props {
  ouvert: boolean;
  onFermer: () => void;
  societe: SocieteSuivie | null;
  mois: string;
  cellule: CelluleSuivi | null;
  libelleType: string;
  onEnregistrer: (statut: StatutInterne, commentaire: string) => Promise<void>;
}

const VARIANTE = { vert: 'success', orange: 'warning', rouge: 'danger' } as const;

export function DetailCellule({
  ouvert,
  onFermer,
  societe,
  mois,
  cellule,
  libelleType,
  onEnregistrer,
}: Props) {
  const [statut, setStatut] = useState<StatutInterne>('a_faire');
  const [commentaire, setCommentaire] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  useEffect(() => {
    if (!ouvert) return;
    setStatut(cellule?.interne?.statut ?? 'a_faire');
    setCommentaire(cellule?.interne?.commentaire ?? '');
  }, [ouvert, cellule]);

  if (!societe || !cellule) return null;

  const jd = cellule.jedeclare;

  const enregistrer = async () => {
    setEnregistrement(true);
    try {
      await onEnregistrer(statut, commentaire);
      onFermer();
    } finally {
      setEnregistrement(false);
    }
  };

  return (
    <Modal isOpen={ouvert} onClose={onFermer} title={societe.societe} size="lg">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Badge variant="gray">{libelleType}</Badge>
          <span>{moisCourt(mois)}</span>
          {societe.siren && <span className="font-mono text-xs">SIREN {societe.siren}</span>}
          {societe.dossier && <span className="text-xs">dossier {societe.dossier}</span>}
        </div>

        <section>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Chez jedeclare
          </h3>
          {jd ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={VARIANTE[jd.etat]}>{jd.libelle}</Badge>
                {jd.anomalie && <Badge variant="warning">anomalie signalée</Badge>}
                {jd.montant !== null && (
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {jd.montant.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                  </span>
                )}
              </div>

              <ol className="space-y-1 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                {jd.etapes.map((etape, i) => (
                  <li key={i} className="text-sm text-gray-600 dark:text-gray-300">
                    {etape}
                  </li>
                ))}
              </ol>

              {jd.lien && (
                <a
                  href={jd.lien}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 text-sm text-teal-600 dark:text-teal-400 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ouvrir l’accusé sur jedeclare
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Aucune télétransmission connue pour ce mois. Cela peut vouloir dire qu’il n’y en a
              pas eu — ou que la période n’a pas encore été analysée.
            </p>
          )}
        </section>

        <section className="border-t border-gray-100 dark:border-gray-800 pt-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Suivi du cabinet
          </h3>
          <div className="space-y-3">
            <Select
              label="Statut"
              value={statut}
              onChange={(e) => setStatut(e.target.value as StatutInterne)}
            >
              {STATUTS_INTERNES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Textarea
              label="Commentaire"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={3}
              placeholder="Ce qui reste à faire, une pièce manquante, un rappel..."
            />
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button onClick={enregistrer} disabled={enregistrement}>
            {enregistrement ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
