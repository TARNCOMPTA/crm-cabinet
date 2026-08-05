import { useNavigate } from 'react-router-dom';
import { useHabilitations } from '../hooks/useHabilitations';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FileUploadZone } from '../components/habilitations/FileUploadZone';
import { ClientServicesTable } from '../components/habilitations/ClientServicesTable';
import { Shield, CheckCircle, Clock, Trash2, FileSpreadsheet, ClipboardCheck, AlertTriangle, Users, Info, ExternalLink } from 'lucide-react';
import { getProgressColor } from '../lib/habilitationsConstants';

export function TaxAuthorizations() {
  const navigate = useNavigate();
  const {
    loading, isImporting, isClearing, isRefreshing,
    showInactiveClients, setShowInactiveClients,
    enrichedClients, unknownGroups,
    totalCount, totalCabinetClients, lastImportDate,
    stats, globalPercentage,
    handleImport, handleClearAll,
    handleUpdateAvancement, handleUpdateCommentaire,
    handleToggleNonConcerne, handleBulkAvancement, handleBulkNonConcerne,
  } = useHabilitations();

  const handleCreateClient = (siren: string, companyName?: string) => {
    const params = new URLSearchParams({ create: siren });
    if (companyName) params.set('name', companyName);
    navigate(`/clients?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }

  const hasData = totalCount > 0;
  const hasClients = enrichedClients.length > 0;
  const progressColors = getProgressColor(globalPercentage);

  return (
    <div className="space-y-6">
      {isRefreshing && (
        <div className="fixed top-20 right-6 z-50 bg-teal-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Mise a jour des donnees...</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Habilitations Fiscales</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Importez et consultez les habilitations fiscales de vos clients
          </p>
        </div>
        {hasData && (
          <Button
            variant="outline"
            onClick={handleClearAll}
            disabled={isClearing}
            className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {isClearing ? 'Suppression...' : 'Tout supprimer'}
          </Button>
        )}
      </div>

      <Card className="dark:bg-gray-900 dark:border-gray-700">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center">
              <Shield className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Import du fichier</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Fichier CSV ou Excel des habilitations usager (impots.gouv.fr)
              </p>
            </div>
          </div>
          <div className="mb-4 p-3.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1.5">Comment recuperer le fichier ?</p>
                <ol className="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-decimal list-inside">
                  <li>
                    Se rendre sur{' '}
                    <a
                      href="https://www.impots.gouv.fr/professionnels"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-200 inline-flex items-center gap-0.5"
                    >
                      impots.gouv.fr/professionnels
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>Cliquer sur <span className="font-medium">Gerer les services</span></li>
                  <li>Cliquer sur <span className="font-medium">Consulter vos services (habilitations)</span></li>
                  <li>Tout en bas de la page, cliquer sur <span className="font-medium">Telecharger tout</span> (fichier CSV)</li>
                </ol>
              </div>
            </div>
          </div>
          <FileUploadZone onFileSelected={handleImport} isImporting={isImporting} />
        </div>
      </Card>

      {(hasData || hasClients) && (
        <Card className="bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700">
          <CardContent className="py-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Afficher les dossiers inactifs, archives et prospects
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowInactiveClients(!showInactiveClients)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 ${
                  showInactiveClients ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showInactiveClients ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </label>
          </CardContent>
        </Card>
      )}

      {hasData && (
        <>
          <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 ${isRefreshing ? 'opacity-60' : ''}`}>
            <Card className="dark:bg-gray-900 dark:border-gray-700">
              <CardContent className="py-4 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <Users className="w-5 h-5 text-gray-400" />
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalCabinetClients}</p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Clients du cabinet</p>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-900 dark:border-gray-700">
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalCount}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Habilitations totales</p>
              </CardContent>
            </Card>
            <Card className={`dark:bg-gray-900 dark:border-gray-700 ${stats.noHabilitations > 0 ? 'border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-900/10' : ''}`}>
              <CardContent className="py-4 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <AlertTriangle className={`w-5 h-5 ${stats.noHabilitations > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                  <p className={`text-2xl font-bold ${stats.noHabilitations > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {stats.noHabilitations}
                  </p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sans habilitation</p>
              </CardContent>
            </Card>
            <Card className="dark:bg-gray-900 dark:border-gray-700">
              <CardContent className="py-4 text-center">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.incomplete}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Incomplets</p>
              </CardContent>
            </Card>
            <Card className={`dark:bg-gray-900 dark:border-gray-700 ${stats.applicableCount > 0 && stats.complete === stats.applicableCount ? 'border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-900/10' : ''}`}>
              <CardContent className="py-4 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <ClipboardCheck className={`w-5 h-5 ${stats.applicableCount > 0 && stats.complete === stats.applicableCount ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`} />
                  <p className={`text-2xl font-bold ${stats.applicableCount > 0 && stats.complete === stats.applicableCount ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {stats.complete}/{stats.applicableCount}
                  </p>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Dossiers complets</p>
              </CardContent>
            </Card>
            {stats.nonConcerne > 0 && (
              <Card className="border-slate-200 bg-slate-50/30 dark:border-slate-700 dark:bg-slate-900/20">
                <CardContent className="py-4 text-center">
                  <p className="text-2xl font-bold text-slate-500 dark:text-slate-400">{stats.nonConcerne}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Non concernes</p>
                </CardContent>
              </Card>
            )}
          </div>

          <Card className={`overflow-hidden dark:bg-gray-900 dark:border-gray-700 ${isRefreshing ? 'opacity-60' : ''}`}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Avancement global</span>
                </div>
                <span className={`text-lg font-bold ${progressColors.text}`}>
                  {globalPercentage}%
                </span>
              </div>
              <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${progressColors.bar}`}
                  style={{ width: `${globalPercentage}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs text-gray-500 dark:text-gray-400">
                <span><span className="font-semibold text-green-600 dark:text-green-400">{stats.complete}</span> complets</span>
                <span><span className="font-semibold text-amber-600 dark:text-amber-400">{stats.incomplete}</span> incomplets</span>
                <span><span className="font-semibold text-red-600 dark:text-red-400">{stats.noHabilitations}</span> sans habilitation</span>
                {stats.nonConcerne > 0 && (
                  <span><span className="font-semibold text-slate-500 dark:text-slate-400">{stats.nonConcerne}</span> non concernes</span>
                )}
                <span className="ml-auto"><span className="font-semibold text-amber-600 dark:text-amber-400">{unknownGroups.length}</span> SIREN non references</span>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {hasData && lastImportDate && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Clock className="w-3.5 h-3.5" />
          <span>
            Dernier import le{' '}
            {new Date(lastImportDate).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      )}

      {hasClients && (
        <div className={`transition-opacity duration-200 ${isRefreshing ? 'opacity-50' : 'opacity-100'}`}>
          <ClientServicesTable
            data={enrichedClients}
            hasImportData={hasData}
            onToggleNonConcerne={handleToggleNonConcerne}
            onUpdateAvancement={handleUpdateAvancement}
            onUpdateCommentaire={handleUpdateCommentaire}
            onCreateClient={handleCreateClient}
            onBulkAvancement={handleBulkAvancement}
            onBulkNonConcerne={handleBulkNonConcerne}
          />
        </div>
      )}

      {hasData && unknownGroups.length === 0 && (
        <Card className="border-green-200 dark:border-green-800 dark:bg-gray-900">
          <CardContent className="py-6 text-center">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              Tous les SIREN sont references dans votre base clients
            </p>
          </CardContent>
        </Card>
      )}

      {!hasData && !hasClients && (
        <Card className="dark:bg-gray-900 dark:border-gray-700">
          <CardContent className="py-16 text-center">
            <FileSpreadsheet className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
              Aucune habilitation importee
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Importez le fichier CSV de vos habilitations usager depuis impots.gouv.fr pour visualiser les services ouverts pour chaque client.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
