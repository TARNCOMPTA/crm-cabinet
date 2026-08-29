import { useCallback, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Upload, FileDown, AlertTriangle, CheckCircle, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import { messageErreur } from '../../lib/erreurs';
import {
  analyserLignes,
  COLONNES_MODELE,
  type LigneImportee,
  type ResultatImport,
} from '../../lib/repartitionImport';

/**
 * Importer une répartition des parts depuis un tableur.
 * ---------------------------------------------------------------------------
 * Le chemin d'en face du connecteur MCP : là où l'assistant écrit une fiche à
 * la fois dans la conversation, celui-ci en traite cinquante — un tableau
 * préparé ailleurs, déposé ici.
 *
 * ⚠️ LA PRÉVISUALISATION N'EST PAS UNE COURTOISIE, C'EST LE CŒUR DE L'ÉCRAN.
 * Rien ne part en base avant que les lignes n'aient été affichées, ligne par
 * ligne, avec ce qui a été lu et ce qui a été refusé. Un fichier produit par un
 * assistant à partir d'un document de vingt ans mérite d'être regardé avant
 * d'entrer dans un dossier client.
 *
 * ⚠️ L'IMPORT REMPLACE, IL N'AJOUTE PAS. Une répartition est un tout : y
 * ajouter des lignes en laissant les anciennes donnerait une somme fausse, et
 * `UNIQUE (client_id, officer_id, demembrement)` ferait de toute façon échouer
 * l'insertion entière au premier recoupement. Le remplacement passe par la
 * fonction SQL `replace_client_associes`, EN UNE TRANSACTION : deux appels
 * PostgREST laisseraient la fiche vide si le second échouait.
 */

const MAX_OCTETS = 5 * 1024 * 1024;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  nomClient: string;
  motPluriel: string;
  lignesExistantes: number;
  partsTotales: number | null;
  onImporte: () => void;
}

type Etape = 'depot' | 'apercu' | 'ecriture' | 'fini';

export function PartsImportModal({
  isOpen,
  onClose,
  clientId,
  nomClient,
  motPluriel,
  lignesExistantes,
  partsTotales,
  onImporte,
}: Props) {
  const { showToast } = useToast();
  const [etape, setEtape] = useState<Etape>('depot');
  const [survol, setSurvol] = useState(false);
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [source, setSource] = useState<'manual' | 'statuts'>('manual');
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [posees, setPosees] = useState(0);
  const champFichier = useRef<HTMLInputElement>(null);

  function reinitialiser() {
    setEtape('depot');
    setResultat(null);
    setErreurFichier(null);
    setSource('manual');
    setPosees(0);
  }

  function fermer() {
    reinitialiser();
    onClose();
  }

  async function telechargerModele() {
    const XLSX = await import('xlsx');
    const feuille = XLSX.utils.aoa_to_sheet([
      [...COLONNES_MODELE],
      ['Jean', 'DUPONT', '', 750, 'Pleine propriete', '12/05/2004', 'Statuts deposes le 12/05/2004'],
      ['Marie', 'LEROY', '', 250, 'Nue-propriete', '', ''],
      ['', 'HOLDING DU PONT', 'oui', 0, '', '', 'Remplacer 0 par le nombre reel'],
    ]);
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, 'Repartition');
    XLSX.writeFile(classeur, 'modele-repartition-parts.xlsx');
  }

  const lireFichier = useCallback(async (fichier: File) => {
    setErreurFichier(null);
    if (fichier.size > MAX_OCTETS) {
      setErreurFichier(`Fichier trop volumineux (maximum ${MAX_OCTETS / 1024 / 1024} Mo).`);
      return;
    }
    try {
      const XLSX = await import('xlsx');
      const donnees = await fichier.arrayBuffer();
      // `cellDates` : sans lui une cellule au format date arrive en numero de
      // serie Excel, que rien ne distingue d'un nombre de parts.
      const classeur = XLSX.read(donnees, { cellDates: true });
      const premiere = classeur.SheetNames[0];
      if (!premiere) {
        setErreurFichier('Le fichier ne contient aucune feuille.');
        return;
      }
      const feuille = classeur.Sheets[premiere];
      if (!feuille) {
        setErreurFichier('La premiere feuille est illisible.');
        return;
      }
      const rangees = XLSX.utils.sheet_to_json(feuille, { header: 1 }) as unknown[][];
      if (rangees.length < 2) {
        setErreurFichier('Le fichier ne contient aucune ligne sous l’en-tete.');
        return;
      }
      const analyse = analyserLignes(rangees);
      if (analyse.total === 0) {
        setErreurFichier('Aucune ligne exploitable sous l’en-tete.');
        return;
      }
      setResultat(analyse);
      setEtape('apercu');
    } catch (e) {
      setErreurFichier(messageErreur(e, 'Le fichier n’a pas pu etre lu.'));
    }
  }, []);

  /**
   * Retrouve la personne, ou la crée.
   *
   * ⚠️ LA RECHERCHE SUIT L'INDEX UNIQUE de `company_officers`, qui porte sur
   * (prenom, nom, type, date de naissance) en minuscules et sans espaces de
   * bord. S'en écarter créerait un doublon que la base refuserait — et l'import
   * entier échouerait sur une personne déjà connue.
   */
  async function resoudrePersonne(l: LigneImportee): Promise<string> {
    const type = l.personneMorale ? 'morale' : 'physique';
    const { data: connues, error: erreurLecture } = await supabase
      .from('company_officers')
      .select('id, first_name, last_name, person_type, birth_date')
      .eq('person_type', type)
      .ilike('last_name', l.nom);
    if (erreurLecture) throw erreurLecture;

    const meme = (connues ?? []).find(
      (c) =>
        (c.first_name ?? '').trim().toLowerCase() === l.prenom.trim().toLowerCase() &&
        (c.last_name ?? '').trim().toLowerCase() === l.nom.trim().toLowerCase() &&
        !c.birth_date
    );
    if (meme) return meme.id;

    const { data: creee, error } = await supabase
      .from('company_officers')
      .insert({
        first_name: l.prenom,
        last_name: l.nom,
        person_type: type,
        denomination: l.denomination,
        source: 'manual',
      })
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!creee) throw new Error(`La personne « ${l.nom} » n’a pas pu etre creee.`);
    return creee.id;
  }

  async function ecrire() {
    if (!resultat) return;
    const valides = resultat.lignes.filter((l) => l.etat === 'valide');
    if (valides.length === 0) return;

    setEtape('ecriture');
    try {
      const lignesSql = [];
      for (const l of valides) {
        lignesSql.push({
          officer_id: await resoudrePersonne(l),
          nb_parts: l.nbParts,
          demembrement: l.demembrement,
          date_effet: l.dateEffet ?? '',
          acte_source: l.acteSource ?? '',
          notes: '',
        });
      }

      // UNE transaction, cote base : voir l'en-tete de ce fichier.
      const { error } = await supabase.rpc('replace_client_associes', {
        p_client_id: clientId,
        p_lignes: lignesSql,
        p_source: source,
      });
      if (error) throw error;

      setPosees(valides.length);
      setEtape('fini');
      onImporte();
    } catch (e) {
      setEtape('apercu');
      showToast(messageErreur(e, 'L’import a echoue. Rien n’a ete modifie.'), 'error');
    }
  }

  const valides = resultat?.lignes.filter((l) => l.etat === 'valide') ?? [];
  const enErreur = resultat?.lignes.filter((l) => l.etat === 'erreur') ?? [];

  return (
    <Modal isOpen={isOpen} onClose={fermer} title={`Importer une repartition — ${nomClient}`} size="xl">
      {etape === 'depot' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Deposez un tableur dont les colonnes suivent le modele. Rien ne sera enregistre avant
            que vous n’ayez vu ce qui a ete lu.
          </p>

          <Button variant="outline" size="sm" onClick={telechargerModele}>
            <FileDown className="w-4 h-4 mr-1.5" />
            Telecharger le modele
          </Button>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setSurvol(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(false);
              const f = e.dataTransfer.files[0];
              if (f) void lireFichier(f);
            }}
            className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              survol
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            <Upload className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Glissez le fichier ici, ou
            </p>
            <input
              ref={champFichier}
              id="fichier-repartition"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lireFichier(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => champFichier.current?.click()}
            >
              Choisir un fichier
            </Button>
          </div>

          {erreurFichier && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{erreurFichier}</span>
            </div>
          )}
        </div>
      )}

      {etape === 'apercu' && resultat && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="success">{valides.length} ligne(s) lisible(s)</Badge>
            {enErreur.length > 0 && <Badge variant="danger">{enErreur.length} refusee(s)</Badge>}
            <span className="text-gray-600 dark:text-gray-400">
              Somme : {resultat.sommeParts.toLocaleString('fr-FR')} {motPluriel}
              {partsTotales !== null && ` sur ${partsTotales.toLocaleString('fr-FR')} declarees`}
            </span>
          </div>

          {/* Un ecart se dit AVANT d'ecrire, pas apres : c'est le moment ou on
              peut encore reprendre le fichier. */}
          {partsTotales !== null && resultat.sommeParts !== partsTotales && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                La somme des {motPluriel} du fichier ne correspond pas au total declare sur la
                fiche. L’import restera possible, mais la repartition sera signalee comme
                incomplete ou incoherente.
              </span>
            </div>
          )}

          {lignesExistantes > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Ce client porte deja <strong>{lignesExistantes}</strong> ligne(s). L’import les
                <strong> remplace</strong> : une repartition est un tout, on ne l’additionne pas.
              </span>
            </div>
          )}

          <div>
            <label
              htmlFor="source-repartition"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Origine de ces chiffres
            </label>
            <select
              id="source-repartition"
              value={source}
              onChange={(e) => setSource(e.target.value as 'manual' | 'statuts')}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-white/[0.04]"
            >
              <option value="manual">Saisis ou verifies par le cabinet</option>
              <option value="statuts">Deduits des statuts deposes (a confirmer)</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              « Deduits des statuts » marque chaque ligne : elle datera du depot et s’affichera
              comme restant a confirmer.
            </p>
          </div>

          <div className="max-h-72 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Ligne</th>
                  <th className="px-3 py-2 text-left font-medium">Associe</th>
                  <th className="px-3 py-2 text-right font-medium">Parts</th>
                  <th className="px-3 py-2 text-left font-medium">Detention</th>
                  <th className="px-3 py-2 text-left font-medium">Depuis</th>
                  <th className="px-3 py-2 text-left font-medium">Etat</th>
                </tr>
              </thead>
              <tbody>
                {resultat.lignes.map((l) => (
                  <tr
                    key={l.ligne}
                    className={`border-t border-gray-100 dark:border-gray-800 ${
                      l.etat === 'erreur' ? 'bg-red-50/60 dark:bg-red-950/20' : ''
                    }`}
                  >
                    <td className="px-3 py-1.5 text-gray-500">{l.ligne}</td>
                    <td className="px-3 py-1.5">
                      {[l.prenom, l.nom].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {l.etat === 'valide' ? l.nbParts.toLocaleString('fr-FR') : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{l.demembrement}</td>
                    <td className="px-3 py-1.5 text-gray-500">{l.dateEffet ?? '—'}</td>
                    <td className="px-3 py-1.5">
                      {l.etat === 'valide' ? (
                        <span className="text-green-600">lisible</span>
                      ) : (
                        <span className="text-red-600">{l.erreur}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={reinitialiser}>
              Choisir un autre fichier
            </Button>
            <Button onClick={ecrire} disabled={valides.length === 0}>
              Enregistrer {valides.length} ligne(s)
            </Button>
          </div>
        </div>
      )}

      {etape === 'ecriture' && (
        <div className="py-12 text-center">
          <Loader className="mx-auto h-8 w-8 animate-spin text-teal-600" />
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">Enregistrement…</p>
        </div>
      )}

      {etape === 'fini' && (
        <div className="py-10 text-center">
          <CheckCircle className="mx-auto h-10 w-10 text-green-500" />
          <p className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
            {posees} ligne(s) enregistree(s)
          </p>
          {enErreur.length > 0 && (
            <p className="mt-1 text-sm text-gray-500">
              {enErreur.length} ligne(s) refusee(s) n’ont pas ete importees.
            </p>
          )}
          <Button className="mt-5" onClick={fermer}>
            Fermer
          </Button>
        </div>
      )}
    </Modal>
  );
}
