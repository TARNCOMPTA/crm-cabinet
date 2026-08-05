import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Search,
  Loader2,
  AlertCircle,
  Copy,
  MapPin,
  Calendar,
  Tag,
  History,
  Trash2,
  X,
} from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { searchCompaniesByName, CompanySearchResult } from '../../lib/inpiService';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';

type SortKey =
  | 'relevance'
  | 'name-asc'
  | 'name-desc'
  | 'postalCode'
  | 'codeNaf'
  | 'dateRecent'
  | 'dateOld'
  | 'status';

interface HistoryRow {
  id: string;
  query: string;
  results_count: number;
  created_at: string;
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'relevance', label: 'Pertinence (defaut)' },
  { value: 'name-asc', label: 'Nom A-Z' },
  { value: 'name-desc', label: 'Nom Z-A' },
  { value: 'postalCode', label: 'Code postal' },
  { value: 'codeNaf', label: 'Code NAF' },
  { value: 'dateRecent', label: 'Date creation (recent)' },
  { value: 'dateOld', label: 'Date creation (ancien)' },
  { value: 'status', label: 'Statut (actives en premier)' },
];

function isCessee(statut: string): boolean {
  const s = statut.toLowerCase();
  return s.includes('cess') || s.includes('radi');
}

function formatDate(value: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('fr-FR');
}

function formatSiret(siret: string): string {
  if (!siret) return '';
  const clean = siret.replace(/\D/g, '');
  if (clean.length !== 14) return siret;
  return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6, 9)} ${clean.slice(9)}`;
}

function formatSiren(siren: string): string {
  if (!siren) return '';
  const clean = siren.replace(/\D/g, '');
  if (clean.length !== 9) return siren;
  return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
}

function fullAddress(adresse: CompanySearchResult['adresse']): string {
  // Le complement est desormais un champ propre : `buildAddress` ne le replie
  // plus dans `ligne1` avec un « - ». Le lire ici evite de le perdre a
  // l'affichage.
  const line1 = [adresse.ligne1, adresse.complement].map((v) => v?.trim()).filter(Boolean).join(' - ');
  const cpVille = [adresse.codePostal, adresse.ville].filter(Boolean).join(' ');
  const pays = adresse.pays && adresse.pays.toLowerCase() !== 'france' ? adresse.pays : '';
  return [line1, cpVille, pays].filter(Boolean).join(', ');
}

function normalize(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(str: string): string[] {
  return normalize(str).split(' ').filter((t) => t.length >= 2);
}

function nameForRelevance(r: CompanySearchResult): string {
  const raw = (r.denomination || '').trim();
  if (!raw || raw === '(Sans denomination)') return '';
  return raw.replace(/^EI\s+/i, '');
}

function computeRelevance(query: string, r: CompanySearchResult): number {
  const name = nameForRelevance(r);
  if (!name) return 0;

  const qNorm = normalize(query);
  const nNorm = normalize(name);
  if (!qNorm || !nNorm) return 0;

  const qTokens = tokenize(query);
  const nTokens = tokenize(name);
  if (qTokens.length === 0 || nTokens.length === 0) return 0;

  let score = 0;

  if (nNorm === qNorm) {
    score = 1000;
  } else {
    const qReversed = [...qTokens].reverse().join(' ');
    if (nNorm === qReversed) {
      score = 950;
    } else {
      const allWholeWords = qTokens.every((t) => nTokens.includes(t));
      const allSubstring = qTokens.every((t) => nNorm.includes(t));

      if (allWholeWords) {
        score = 700;
        const indices = qTokens.map((t) => nTokens.indexOf(t));
        const inOrder = indices.every((v, i, arr) => i === 0 || v >= arr[i - 1]);
        if (inOrder) score += 100;
      } else if (allSubstring) {
        score = 500;
      } else {
        const matched = qTokens.filter((t) => nNorm.includes(t)).length;
        score = matched * 100;
      }
    }
  }

  if (qTokens[0] && nTokens[0] === qTokens[0]) score += 50;

  if (nNorm.startsWith(qNorm)) score += 30;

  if (isCessee(r.statut)) score -= 200;

  if (r.siret) score += 20;

  return score;
}

function displayName(r: CompanySearchResult): { label: string; isFallback: boolean } {
  const name = (r.denomination || '').trim();
  if (name && name !== '(Sans denomination)') return { label: name, isFallback: false };
  if (r.siren) {
    const formatted = r.siren.length === 9
      ? `${r.siren.slice(0, 3)} ${r.siren.slice(3, 6)} ${r.siren.slice(6)}`
      : r.siren;
    const prefix = r.isPersonnePhysique ? 'Entrepreneur individuel' : 'Entreprise';
    return { label: `${prefix} - SIREN ${formatted}`, isFallback: true };
  }
  return { label: 'Entreprise sans denomination', isFallback: true };
}

export function CompanySearch() {
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  const [sortBy, setSortBy] = useState<SortKey>('relevance');
  const [hideCessees, setHideCessees] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  const [history, setHistory] = useState<HistoryRow[]>([]);

  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    const { data } = await supabase
      .from('inpi_search_history')
      .select('id, query, results_count, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    setHistory((data || []) as HistoryRow[]);
  }

  async function persistHistory(q: string, count: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('inpi_search_history').insert({
      user_id: user.id,
      query: q,
      results_count: count,
    });
    void loadHistory();
  }

  async function deleteHistoryEntry(id: string) {
    await supabase.from('inpi_search_history').delete().eq('id', id);
    setHistory((rows) => rows.filter((r) => r.id !== id));
  }

  async function runSearch(q?: string) {
    const target = (q ?? query).trim();
    if (target.length < 2) {
      setError('Saisissez au moins 2 caracteres');
      return;
    }
    setQuery(target);
    setLoading(true);
    setError(null);
    setSearched(true);
    setDepartmentFilter('all');
    try {
      const res = await searchCompaniesByName(target);
      if (!res.success) {
        setError(res.message);
        setResults([]);
        return;
      }
      const list = res.results || [];
      setResults(list);
      void persistHistory(target, list.length);
    } catch (err: any) {
      setError(err?.message || 'Erreur inattendue');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setQuery('');
    setResults([]);
    setError(null);
    setSearched(false);
    setHideCessees(false);
    setDepartmentFilter('all');
    setSortBy('relevance');
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} copie`, 'success');
    } catch {
      showToast('Copie impossible', 'error');
    }
  }

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) {
      const cp = r.adresse.codePostal;
      if (cp && cp.length >= 2) set.add(cp.slice(0, 2));
    }
    return Array.from(set).sort();
  }, [results]);

  const sortedResults = useMemo(() => {
    let list = [...results];
    if (hideCessees) {
      list = list.filter((r) => !isCessee(r.statut));
    }
    if (departmentFilter !== 'all') {
      list = list.filter((r) => r.adresse.codePostal.startsWith(departmentFilter));
    }
    switch (sortBy) {
      case 'name-asc':
        list.sort((a, b) => displayName(a).label.localeCompare(displayName(b).label, 'fr'));
        break;
      case 'name-desc':
        list.sort((a, b) => displayName(b).label.localeCompare(displayName(a).label, 'fr'));
        break;
      case 'postalCode':
        list.sort((a, b) => (a.adresse.codePostal || '').localeCompare(b.adresse.codePostal || ''));
        break;
      case 'codeNaf':
        list.sort((a, b) => (a.codeNaf || '').localeCompare(b.codeNaf || ''));
        break;
      case 'dateRecent':
        list.sort((a, b) => (b.dateCreation || '').localeCompare(a.dateCreation || ''));
        break;
      case 'dateOld':
        list.sort((a, b) => (a.dateCreation || '').localeCompare(b.dateCreation || ''));
        break;
      case 'status':
        list.sort((a, b) => Number(isCessee(a.statut)) - Number(isCessee(b.statut)));
        break;
      case 'relevance':
      default: {
        const trimmedQuery = query.trim();
        if (trimmedQuery.length >= 2) {
          const scored = list.map((r) => ({ r, score: computeRelevance(trimmedQuery, r) }));
          scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return displayName(a.r).label.localeCompare(displayName(b.r).label, 'fr');
          });
          list = scored.map((s) => s.r);
        }
        break;
      }
    }
    return list;
  }, [results, sortBy, hideCessees, departmentFilter, query]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-6">
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Recherche entreprise par nom
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Trouvez le SIRET, l'adresse et le code NAF d'une entreprise via l'API INPI
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Ex: Carrefour, Total, ..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch();
                }}
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button onClick={() => runSearch()} disabled={loading || query.trim().length < 2}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Recherche...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Rechercher
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={reset} disabled={loading && !searched}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-800 dark:text-red-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {searched && !loading && results.length > 0 && (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div className="flex-1">
                  <Select
                    label="Trier par"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortKey)}
                    options={SORT_OPTIONS}
                  />
                </div>
                <div className="w-full md:w-48">
                  <Select
                    label="Departement"
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    options={[
                      { value: 'all', label: 'Tous' },
                      ...departments.map((d) => ({ value: d, label: d })),
                    ]}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 pb-2">
                  <input
                    type="checkbox"
                    checked={hideCessees}
                    onChange={(e) => setHideCessees(e.target.checked)}
                    className="rounded"
                  />
                  Masquer les cessees
                </label>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {sortedResults.length} resultat(s) sur {results.length}
              </p>
            </CardContent>
          </Card>
        )}

        {searched && !loading && results.length === 0 && !error && (
          <Card>
            <CardContent>
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Building2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>Aucune entreprise trouvee pour "{query}"</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {sortedResults.map((r, idx) => {
            const cessee = isCessee(r.statut);
            const name = displayName(r);
            return (
              <Card key={`${r.siren}-${idx}`}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className={`font-semibold truncate ${
                          name.isFallback
                            ? 'text-gray-600 dark:text-gray-400 italic'
                            : 'text-gray-900 dark:text-white'
                        }`}>
                          {name.label}
                        </h3>
                        {!name.isFallback && (
                          <button
                            onClick={() => copyToClipboard(name.label, 'Nom')}
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06] flex-shrink-0"
                            title="Copier le nom"
                          >
                            <Copy className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {r.formeJuridique && (
                          <Badge variant="default">{r.formeJuridique}</Badge>
                        )}
                        <Badge variant={cessee ? 'danger' : 'success'}>{r.statut}</Badge>
                        {r.dateCreation && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Calendar className="w-3 h-3" />
                            {formatDate(r.dateCreation)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">SIREN</span>
                          <p className="font-mono text-gray-900 dark:text-gray-100">
                            {formatSiren(r.siren)}
                          </p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(r.siren, 'SIREN')}
                          className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                          title="Copier le SIREN"
                        >
                          <Copy className="w-3.5 h-3.5 text-gray-500" />
                        </button>
                      </div>
                      {r.siret && (
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">SIRET (siege)</span>
                            <p className="font-mono text-gray-900 dark:text-gray-100">
                              {formatSiret(r.siret)}
                            </p>
                          </div>
                          <button
                            onClick={() => copyToClipboard(r.siret, 'SIRET')}
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06]"
                            title="Copier le SIRET"
                          >
                            <Copy className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      {r.codeNaf && (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Code NAF / APE
                            </span>
                            <p className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
                              <Tag className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                              <span className="font-mono">{r.codeNaf}</span>
                              {r.libelleNaf && (
                                <span className="text-gray-600 dark:text-gray-400 truncate">- {r.libelleNaf}</span>
                              )}
                            </p>
                          </div>
                          <button
                            onClick={() => copyToClipboard(r.codeNaf, 'Code NAF')}
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06] flex-shrink-0"
                            title="Copier le code NAF"
                          >
                            <Copy className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                        </div>
                      )}
                      {fullAddress(r.adresse) && (
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Adresse</span>
                            <p className="text-gray-900 dark:text-gray-100 flex items-start gap-2">
                              <MapPin className="w-3.5 h-3.5 mt-0.5 text-gray-500 flex-shrink-0" />
                              <span>{fullAddress(r.adresse)}</span>
                            </p>
                          </div>
                          <button
                            onClick={() => copyToClipboard(fullAddress(r.adresse), 'Adresse')}
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06] flex-shrink-0"
                            title="Copier l'adresse"
                          >
                            <Copy className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                        </div>
                      )}
                      {r.adresse.codeInsee && (
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Code INSEE</span>
                            <p className="font-mono text-gray-900 dark:text-gray-100">
                              {r.adresse.codeInsee}
                            </p>
                          </div>
                          <button
                            onClick={() => copyToClipboard(r.adresse.codeInsee!, 'Code INSEE')}
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06] flex-shrink-0"
                            title="Copier le code INSEE"
                          >
                            <Copy className="w-3.5 h-3.5 text-gray-500" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Recherches recentes
              </h3>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Aucune recherche enregistree
              </p>
            ) : (
              <ul className="space-y-1.5">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 group">
                    <button
                      onClick={() => runSearch(h.query)}
                      className="flex-1 text-left px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                    >
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {h.query}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {h.results_count} resultat(s) - {formatDate(h.created_at)}
                      </p>
                    </button>
                    <button
                      onClick={() => deleteHistoryEntry(h.id)}
                      className="p-1.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/40 transition-opacity"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
