import { useState, useCallback, useRef } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Upload, Download, CheckCircle, AlertTriangle, XCircle, Loader, X, FileDown, Filter } from 'lucide-react';
import { parseExcelFile, generateExcelTemplate, exportErrorsToExcel, ParsedClient, ParseResult, MAX_ROWS, MAX_FILE_SIZE } from '../../lib/clientImportParser';
import { bulkCreateClients, ImportResult } from '../../lib/clientImportService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

interface ClientImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

type ImportStage = 'upload' | 'preview' | 'importing' | 'complete';
type PreviewFilter = 'all' | 'valid' | 'error' | 'duplicate';

export function ClientImportModal({ isOpen, onClose, onImportComplete }: ClientImportModalProps) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [stage, setStage] = useState<ImportStage>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, stage: '' });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelledRef = useRef(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>('all');
  const ITEMS_PER_PAGE = 50;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const excelFile = files.find(f =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );

    if (excelFile) {
      await processFile(excelFile);
    } else {
      showToast('Veuillez sélectionner un fichier Excel (.xlsx ou .xls)', 'error');
    }
  }, [showToast]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  }, []);

  const processFile = async (file: File) => {
    try {
      showToast('Analyse du fichier en cours...', 'info');
      const result = await parseExcelFile(file);

      setParseResult(result);
      setPreviewPage(0);
      setStage('preview');
      showToast(`${result.validLines} ligne(s) valide(s) détectée(s)`, 'success');
    } catch (error: any) {
      showToast(error.message || 'Erreur lors de la lecture du fichier', 'error');
      setStage('upload');
    }
  };

  const handleDownloadTemplate = () => {
    try {
      generateExcelTemplate();
      showToast('Modèle téléchargé avec succès', 'success');
    } catch {
      showToast('Erreur lors du téléchargement du modèle', 'error');
    }
  };

  const handleImport = async () => {
    if (!parseResult || !profile) return;

    setStage('importing');
    setIsCancelling(false);
    cancelledRef.current = false;
    setImportProgress({ current: 0, total: 0, stage: 'Création des clients...' });

    try {
      const result = await bulkCreateClients(
        parseResult.clients,
        (current, total) => {
          if (cancelledRef.current) return;
          setImportProgress({
            current,
            total,
            stage: `Création des clients (${current}/${total})...`
          });
        }
      );

      if (cancelledRef.current) {
        showToast('Import annulé', 'info');
        setStage('preview');
        return;
      }

      setImportResult(result);
      setImportProgress({ current: 0, total: 0, stage: 'Finalisation...' });
      setStage('complete');

      let message = `Import terminé : ${result.created} client(s) créé(s)`;
      if (result.duplicatesIgnored > 0) {
        message += `, ${result.duplicatesIgnored} doublon(s) ignoré(s)`;
      }
      if (result.errors.length > 0) {
        message += `, ${result.errors.length} erreur(s)`;
      }

      showToast(message, result.errors.length > 0 ? 'warning' : 'success');
    } catch (error: any) {
      showToast(error.message || 'Erreur lors de l\'import', 'error');
      setStage('preview');
    }
  };

  const handleCancel = () => {
    if (stage === 'importing') {
      setIsCancelling(true);
      cancelledRef.current = true;
    }
  };

  const handleClose = () => {
    if (stage === 'importing' && !isCancelling) return;

    setStage('upload');
    setParseResult(null);
    setImportResult(null);
    setImportProgress({ current: 0, total: 0, stage: '' });
    setIsCancelling(false);
    cancelledRef.current = false;
    onClose();
  };

  const handleComplete = () => {
    handleClose();
    onImportComplete();
  };

  const getStatusIcon = (status: ParsedClient['status']) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'duplicate':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const renderUploadStage = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Importer des clients depuis Excel</h3>
          <p className="text-sm text-gray-600 mt-1">
            Importez plusieurs clients en masse
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleDownloadTemplate}
          className="flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Télécharger le modèle
        </Button>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center transition-colors
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        `}
      >
        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-700 font-medium mb-2">
          Glissez-déposez votre fichier Excel ici
        </p>
        <p className="text-sm text-gray-500 mb-4">ou</p>
        <label className="inline-block">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileSelect}
            className="hidden"
          />
          <span className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
            Parcourir les fichiers
          </span>
        </label>
        <p className="text-xs text-gray-400 mt-4">
          Formats acceptés : .xlsx, .xls
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 mb-2">Colonnes attendues dans le fichier :</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>- Colonne A : <strong>SIRET</strong> (14 chiffres) - Obligatoire</li>
          <li>- Colonne B : <strong>Nom</strong> - Optionnel (si vide, "Inconnu" sera utilisé)</li>
        </ul>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-2">Limites :</h4>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>- Taille maximale : {MAX_FILE_SIZE / 1024 / 1024} MB</li>
          <li>- Nombre maximal de lignes : {MAX_ROWS}</li>
        </ul>
      </div>
    </div>
  );

  const handleExportErrors = () => {
    if (!parseResult) return;
    try {
      exportErrorsToExcel(parseResult.clients);
      showToast('Fichier d\'erreurs exporté avec succès', 'success');
    } catch {
      showToast('Erreur lors de l\'export', 'error');
    }
  };

  const renderPreviewStage = () => {
    if (!parseResult) return null;

    const validClients = parseResult.clients.filter(c => c.status === 'valid');
    const duplicates = parseResult.clients.filter(c => c.status === 'duplicate');
    const errors = parseResult.clients.filter(c => c.status === 'error');

    let filteredClients = parseResult.clients;
    if (previewFilter === 'valid') filteredClients = validClients;
    else if (previewFilter === 'duplicate') filteredClients = duplicates;
    else if (previewFilter === 'error') filteredClients = errors;

    const totalPages = Math.ceil(filteredClients.length / ITEMS_PER_PAGE);
    const startIndex = previewPage * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentPageClients = filteredClients.slice(startIndex, endIndex);

    const hasErrors = errors.length > 0 || duplicates.length > 0;

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Prévisualisation de l'import</h3>
            <p className="text-sm text-gray-600 mt-1">
              Vérifiez les données avant l'import
            </p>
          </div>
          {hasErrors && (
            <Button
              variant="outline"
              onClick={handleExportErrors}
              className="flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50"
            >
              <FileDown className="w-4 h-4" />
              Exporter les erreurs
            </Button>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => { setPreviewFilter('valid'); setPreviewPage(0); }}
            className={`bg-green-50 border ${
              previewFilter === 'valid' ? 'border-green-500 ring-2 ring-green-500' : 'border-green-200'
            } rounded-lg p-4 text-left hover:border-green-400 transition-all cursor-pointer`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-sm font-medium text-green-900">Valides</span>
            </div>
            <p className="text-2xl font-bold text-green-700 mt-2">{validClients.length}</p>
          </button>

          <button
            onClick={() => { setPreviewFilter('duplicate'); setPreviewPage(0); }}
            className={`bg-orange-50 border ${
              previewFilter === 'duplicate' ? 'border-orange-500 ring-2 ring-orange-500' : 'border-orange-200'
            } rounded-lg p-4 text-left hover:border-orange-400 transition-all cursor-pointer`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <span className="text-sm font-medium text-orange-900">Doublons</span>
            </div>
            <p className="text-2xl font-bold text-orange-700 mt-2">{duplicates.length}</p>
          </button>

          <button
            onClick={() => { setPreviewFilter('error'); setPreviewPage(0); }}
            className={`bg-red-50 border ${
              previewFilter === 'error' ? 'border-red-500 ring-2 ring-red-500' : 'border-red-200'
            } rounded-lg p-4 text-left hover:border-red-400 transition-all cursor-pointer`}
          >
            <div className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-medium text-red-900">Erreurs</span>
            </div>
            <p className="text-2xl font-bold text-red-700 mt-2">{errors.length}</p>
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Filter className="w-4 h-4" />
            <span>
              Affichage : {previewFilter === 'all' ? 'Tout' :
                         previewFilter === 'valid' ? 'Valides seulement' :
                         previewFilter === 'duplicate' ? 'Doublons seulement' :
                         'Erreurs seulement'}
            </span>
            {previewFilter !== 'all' && (
              <button
                onClick={() => { setPreviewFilter('all'); setPreviewPage(0); }}
                className="text-blue-600 hover:text-blue-700 underline ml-2"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        {hasErrors && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Attention
            </h4>
            <ul className="text-sm text-yellow-800 space-y-1">
              {errors.length > 0 && (
                <li>- {errors.length} ligne(s) contiennent des erreurs et ne seront pas importées</li>
              )}
              {duplicates.length > 0 && (
                <li>- {duplicates.length} doublon(s) détecté(s) (clients déjà existants dans la base)</li>
              )}
              <li>- Seules les {validClients.length} lignes valides seront importées</li>
              {hasErrors && (
                <li>- Utilisez le bouton "Exporter les erreurs" pour obtenir un fichier à corriger</li>
              )}
            </ul>
          </div>
        )}

        <div className="border border-gray-200 rounded-lg">
          <div className="max-h-96 overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ligne</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SIRET</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {currentPageClients.map((client) => (
                  <tr key={client.lineNumber} className={
                    client.status === 'error' ? 'bg-red-50' :
                    client.status === 'duplicate' ? 'bg-orange-50' :
                    'hover:bg-gray-50'
                  }>
                    <td className="px-4 py-3 text-sm text-gray-900">{client.lineNumber}</td>
                    <td className="px-4 py-3">{getStatusIcon(client.status)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-mono">{client.siret || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{client.nom_entreprise}</td>
                    <td className="px-4 py-3 text-sm">
                      {client.errorMessage ? (
                        <span className="text-red-600">{client.errorMessage}</span>
                      ) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Affichage {startIndex + 1} à {Math.min(endIndex, filteredClients.length)} sur {filteredClients.length} lignes
                {previewFilter !== 'all' && (
                  <span className="text-gray-500 ml-1">
                    (filtré sur {parseResult.clients.length} total)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPreviewPage(p => Math.max(0, p - 1))}
                  disabled={previewPage === 0}
                  className="text-sm"
                >
                  Précédent
                </Button>
                <span className="px-3 py-1 text-sm text-gray-600">
                  Page {previewPage + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPreviewPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={previewPage === totalPages - 1}
                  className="text-sm"
                >
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <Button variant="outline" onClick={() => { setStage('upload'); setPreviewPage(0); }}>
            Annuler
          </Button>
          <Button
            onClick={handleImport}
            disabled={validClients.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Importer {validClients.length} client(s)
          </Button>
        </div>
      </div>
    );
  };

  const renderImportingStage = () => (
    <div className="space-y-6 py-8">
      <div className="text-center">
        {isCancelling ? (
          <X className="w-12 h-12 text-orange-600 mx-auto mb-4" />
        ) : (
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
        )}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {isCancelling ? 'Annulation en cours...' : 'Import en cours...'}
        </h3>
        <p className="text-sm text-gray-600">{importProgress.stage}</p>
      </div>

      {importProgress.total > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Progression</span>
            <span>{importProgress.current} / {importProgress.total}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${
                isCancelling ? 'bg-orange-500' : 'bg-blue-600'
              }`}
              style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 text-right">
            {Math.round((importProgress.current / importProgress.total) * 100)}%
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 text-center">
        {isCancelling
          ? 'Annulation en cours, les clients déjà créés seront conservés...'
          : 'Veuillez patienter, cette opération peut prendre quelques instants...'}
      </p>

      {!isCancelling && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="text-red-600 border-red-300 hover:bg-red-50"
          >
            Annuler l'import
          </Button>
        </div>
      )}
    </div>
  );

  const renderCompleteStage = () => {
    if (!importResult) return null;

    return (
      <div className="space-y-6">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Import terminé !</h3>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Clients créés</span>
            <span className="text-lg font-bold text-green-600">{importResult.created}</span>
          </div>

          {importResult.duplicatesIgnored > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Doublons ignorés</span>
              <span className="text-lg font-bold text-orange-600">{importResult.duplicatesIgnored}</span>
            </div>
          )}

          {importResult.errors.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Erreurs</span>
              <span className="text-lg font-bold text-red-600">{importResult.errors.length}</span>
            </div>
          )}
        </div>

        {importResult.errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-48 overflow-y-auto">
            <h4 className="font-semibold text-red-900 mb-2">Détail des erreurs :</h4>
            <ul className="text-sm text-red-800 space-y-1">
              {importResult.errors.map((error, idx) => (
                <li key={idx}>Ligne {error.lineNumber}: {error.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Fermer
          </Button>
          <Button onClick={handleComplete} className="bg-blue-600 hover:bg-blue-700 text-white">
            Voir les clients créés
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title=""
      size="xl"
    >
      <div className="p-6">
        {stage === 'upload' && renderUploadStage()}
        {stage === 'preview' && renderPreviewStage()}
        {stage === 'importing' && renderImportingStage()}
        {stage === 'complete' && renderCompleteStage()}
      </div>
    </Modal>
  );
}
