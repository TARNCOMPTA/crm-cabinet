import { useState, useEffect } from 'react';
import { Search, Loader2, Building2, AlertCircle, Check, X, ExternalLink, Plus, MapPin } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { getDas2Entries, addDas2Entry, removeDas2Entry, type Das2Entry } from '../../lib/bilanService';
import { searchCompanyByINPI, type INPICompanyData } from '../../lib/inpiService';

interface Props {
  cardId: string;
  onSaved?: () => void;
}

export function BilanDAS2Panel({ cardId, onSaved }: Props) {
  const [siret, setSiret] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<INPICompanyData | null>(null);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<Das2Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    loadEntries();
  }, [cardId]);

  async function loadEntries() {
    try {
      const data = await getDas2Entries(cardId);
      setEntries(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  function formatSiret(value: string) {
    return value.replace(/\D/g, '').slice(0, 14);
  }

  async function handleSearch() {
    const clean = siret.replace(/\s/g, '');
    if (clean.length < 9) {
      setError('Saisissez au moins un SIREN (9 chiffres) ou SIRET (14 chiffres)');
      return;
    }

    setSearching(true);
    setError('');
    setCompany(null);

    try {
      const result = await searchCompanyByINPI(clean);
      if (result.success && result.data) {
        setCompany(result.data);
      } else {
        setError(result.message || 'Entreprise non trouvee');
      }
    } catch {
      setError('Erreur lors de la recherche');
    } finally {
      setSearching(false);
    }
  }

  async function handleValidate() {
    if (!company) return;
    setSaving(true);
    try {
      const entry = await addDas2Entry(cardId, company);
      setEntries((prev) => [...prev, entry]);
      setCompany(null);
      setSiret('');
      setShowSearch(false);
      onSaved?.();
    } catch {
      setError('Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(entryId: string) {
    try {
      await removeDas2Entry(entryId);
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
      onSaved?.();
    } catch {
      setError('Erreur lors de la suppression');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && siret.replace(/\s/g, '').length >= 9) {
      handleSearch();
    }
  }

  function formatAddress(entry: Das2Entry) {
    const parts = [entry.address_line, entry.address_postal_code, entry.address_city].filter(Boolean);
    return parts.join(', ');
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-4">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500">Chargement DAS2...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h4 className="font-semibold text-sm text-gray-900 dark:text-white">DAS2 - Fiches INPI</h4>
          {entries.length > 0 && (
            <span className="text-xs bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded-full font-medium">
              {entries.length}
            </span>
          )}
        </div>
        {!showSearch && (
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <div className="space-y-2 mb-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-teal-200 dark:border-teal-800/50"
            >
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 mt-0.5 rounded-md bg-teal-600 flex items-center justify-center shrink-0">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {entry.company_name}
                  </p>
                  <div className="mt-1 space-y-0.5">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      SIRET: {entry.company_siret || entry.company_siren}
                    </p>
                    {(entry.address_line || entry.address_city) && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{formatAddress(entry)}</span>
                      </div>
                    )}
                    {entry.code_ape && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        APE: {entry.code_ape}{entry.libelle_ape ? ` - ${entry.libelle_ape}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <a
                    href={`https://registre-national-entreprises.inpi.fr/entreprise/${entry.company_siren}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                    title="Voir sur INPI"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => handleRemove(entry.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Retirer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showSearch && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                value={siret}
                onChange={(e) => {
                  setSiret(formatSiret(e.target.value));
                  setError('');
                  setCompany(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="SIRET ou SIREN..."
                className="text-sm font-mono"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSearch}
              disabled={searching || siret.replace(/\s/g, '').length < 9}
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setShowSearch(false); setCompany(null); setSiret(''); setError(''); }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {company && (
            <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {company.denomination}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                  SIRET: {company.siret || company.siren}
                </p>
                {company.adresse && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>{[company.adresse.ligne1, company.adresse.complement, company.adresse.codePostal, company.adresse.ville].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                {company.codeAPE && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    APE: {company.codeAPE}{company.libelleAPE ? ` - ${company.libelleAPE}` : ''}
                  </p>
                )}
              </div>
              <Button
                variant="primary"
                size="sm"
                className="mt-3 w-full"
                onClick={handleValidate}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Valider
              </Button>
            </div>
          )}
        </div>
      )}

      {entries.length === 0 && !showSearch && (
        <p className="text-xs text-gray-400 dark:text-gray-500 italic">
          Aucune entite DAS2 enregistree. Cliquez sur "Ajouter" pour rechercher.
        </p>
      )}
    </div>
  );
}
