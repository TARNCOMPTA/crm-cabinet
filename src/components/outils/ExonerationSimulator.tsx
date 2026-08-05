import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Card, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Building2,
  Calendar,
  Filter,
  Eye,
  Loader2,
} from 'lucide-react';

interface ExonerationRow {
  id: string;
  client_id: string;
  type_exoneration: string;
  date_debut: string;
  date_fin: string;
  client: {
    id: string;
    nom_entreprise: string;
    siren: string | null;
  };
}

interface MonthRate {
  month: number;
  year: number;
  rate: number;
  isTransition: boolean;
}

const MONTH_LABELS = [
  'Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun',
  'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec',
];

const RATE_COLORS: Record<number, { bg: string; text: string; cell: string }> = {
  100: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
    text: 'text-emerald-800 dark:text-emerald-300',
    cell: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  75: {
    bg: 'bg-teal-100 dark:bg-teal-900/40',
    text: 'text-teal-800 dark:text-teal-300',
    cell: 'bg-teal-50 dark:bg-teal-950/30',
  },
  50: {
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    text: 'text-amber-800 dark:text-amber-300',
    cell: 'bg-amber-50 dark:bg-amber-950/30',
  },
  25: {
    bg: 'bg-orange-100 dark:bg-orange-900/40',
    text: 'text-orange-800 dark:text-orange-300',
    cell: 'bg-orange-50 dark:bg-orange-950/30',
  },
  0: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-400 dark:text-gray-500',
    cell: 'bg-gray-50 dark:bg-gray-900/30',
  },
};

function computeMonthlyRates(dateDebut: string): MonthRate[] {
  const start = new Date(dateDebut);
  const startMonth = start.getMonth();
  const startYear = start.getFullYear();
  const rates: MonthRate[] = [];

  for (let i = 0; i < 8 * 12; i++) {
    const month = (startMonth + i) % 12;
    const year = startYear + Math.floor((startMonth + i) / 12);

    const elapsedMonths = i;
    const elapsedYears = Math.floor(elapsedMonths / 12);
    const currentMonthInYear = elapsedMonths % 12;

    let rate = 0;
    let isTransition = false;

    if (elapsedYears < 5) {
      rate = 100;
    } else if (elapsedYears === 5) {
      rate = 75;
    } else if (elapsedYears === 6) {
      rate = 50;
    } else if (elapsedYears === 7) {
      rate = 25;
    }

    if (elapsedYears >= 5 && elapsedYears <= 7 && currentMonthInYear === 0) {
      isTransition = true;
    }

    if (elapsedYears === 4 && currentMonthInYear === 11) {
      isTransition = true;
    }

    rates.push({ month, year, rate, isTransition });
  }

  return rates;
}

function groupByCalendarYear(rates: MonthRate[]): Map<number, MonthRate[]> {
  const grouped = new Map<number, MonthRate[]>();
  for (const r of rates) {
    if (!grouped.has(r.year)) {
      grouped.set(r.year, []);
    }
    grouped.get(r.year)!.push(r);
  }
  return grouped;
}

function getCurrentRate(dateDebut: string): { rate: number; isExpired: boolean } {
  const start = new Date(dateDebut);
  const today = new Date();
  const diffMs = today.getTime() - start.getTime();
  const diffYears = diffMs / (365.25 * 24 * 60 * 60 * 1000);

  if (diffYears < 0) return { rate: 100, isExpired: false };
  if (diffYears < 5) return { rate: 100, isExpired: false };
  if (diffYears < 6) return { rate: 75, isExpired: false };
  if (diffYears < 7) return { rate: 50, isExpired: false };
  if (diffYears < 8) return { rate: 25, isExpired: false };
  return { rate: 0, isExpired: true };
}

function getRateBadge(rate: number, isExpired: boolean) {
  if (isExpired) return <Badge variant="gray">Expire</Badge>;
  if (rate === 100) return <Badge variant="success">100%</Badge>;
  if (rate === 75) return <Badge variant="info">75%</Badge>;
  if (rate === 50) return <Badge variant="warning">50%</Badge>;
  if (rate === 25) return <Badge variant="orange">25%</Badge>;
  return <Badge variant="gray">{rate}%</Badge>;
}

type RateFilter = 'all' | '100' | '75' | '50' | '25' | 'expired';

export function ExonerationSimulator() {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ExonerationRow[]>([]);
  const [myClientIds, setMyClientIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [rateFilter, setRateFilter] = useState<RateFilter>('all');
  const [showMyClients, setShowMyClients] = useState(true);
  const [expandedYears, setExpandedYears] = useState<Record<string, Set<number>>>({});

  const loadData = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    try {
      const [exoResult, assignResult] = await Promise.all([
        supabase
          .from('tax_exemptions')
          .select('id, client_id, type_exoneration, date_debut, date_fin, client:clients!inner(id, nom_entreprise, siren)')
          .eq('client.statut', 'actif')
          .order('date_debut', { ascending: false }),
        supabase
          .from('client_collaborators')
          .select('client_id')
          .eq('user_id', profile.id),
      ]);

      if (exoResult.error) throw exoResult.error;
      setItems((exoResult.data || []) as unknown as ExonerationRow[]);

      if (!assignResult.error && assignResult.data) {
        setMyClientIds(new Set(assignResult.data.map((a) => a.client_id)));
      }
    } catch {
      showToast('Erreur lors du chargement des exonerations', 'error');
    } finally {
      setLoading(false);
    }
  }, [profile, profile?.id, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const enriched = useMemo(() => {
    return items.map((item) => {
      const { rate, isExpired } = getCurrentRate(item.date_debut);
      return { ...item, currentRate: rate, isExpired };
    });
  }, [items]);

  const filtered = useMemo(() => {
    return enriched.filter((item) => {
      if (showMyClients && !myClientIds.has(item.client_id)) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          item.client.nom_entreprise.toLowerCase().includes(q) ||
          item.client.siren?.includes(q) ||
          item.type_exoneration.toLowerCase().includes(q);
        if (!match) return false;
      }

      if (rateFilter !== 'all') {
        if (rateFilter === 'expired') return item.isExpired;
        return item.currentRate === parseInt(rateFilter) && !item.isExpired;
      }

      return true;
    });
  }, [enriched, search, rateFilter, showMyClients, myClientIds]);

  const toggleYear = (itemId: string, year: number) => {
    setExpandedYears((prev) => {
      const next = { ...prev };
      const current = next[itemId] ? new Set(next[itemId]) : new Set<number>();
      if (current.has(year)) {
        current.delete(year);
      } else {
        current.add(year);
      }
      next[itemId] = current;
      return next;
    });
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Calendar className="w-14 h-14 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
            Aucune exoneration
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Ajoutez des exonérations dans le module "Exonérations Fiscales" pour visualiser le simulateur mensuel.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un client, SIREN..."
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
          <input
            type="checkbox"
            checked={showMyClients}
            onChange={(e) => setShowMyClients(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm text-gray-700 dark:text-gray-300">Voir mes dossiers</span>
        </label>

        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-gray-400" />
          {([
            { value: 'all', label: 'Tous' },
            { value: '100', label: '100%' },
            { value: '75', label: '75%' },
            { value: '50', label: '50%' },
            { value: '25', label: '25%' },
            { value: 'expired', label: 'Expires' },
          ] as { value: RateFilter; label: string }[]).map((f) => (
            <button
              key={f.value}
              onClick={() => setRateFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                rateFilter === f.value
                  ? 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/40 dark:border-teal-700 dark:text-teal-300'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Aucun resultat pour cette recherche</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <SimulatorCard
              key={item.id}
              item={item}
              expandedYears={expandedYears[item.id] || new Set()}
              onToggleYear={(year) => toggleYear(item.id, year)}
              onNavigate={() => navigate(`/clients/${item.client_id}`)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500 dark:text-gray-400 pt-2">
        <span className="font-medium">Legende :</span>
        {[100, 75, 50, 25].map((rate) => (
          <div key={rate} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${RATE_COLORS[rate].bg}`} />
            <span>{rate}%</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gray-100 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600" />
          <span>Expire</span>
        </div>
      </div>
    </div>
  );
}

function SimulatorCard({
  item,
  expandedYears,
  onToggleYear,
  onNavigate,
}: {
  item: ExonerationRow & { currentRate: number; isExpired: boolean };
  expandedYears: Set<number>;
  onToggleYear: (year: number) => void;
  onNavigate: () => void;
}) {
  const monthlyRates = useMemo(() => computeMonthlyRates(item.date_debut), [item.date_debut]);
  const yearGroups = useMemo(() => groupByCalendarYear(monthlyRates), [monthlyRates]);
  const sortedYears = useMemo(() => Array.from(yearGroups.keys()).sort((a, b) => a - b), [yearGroups]);

  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="w-10 h-10 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onNavigate}
              className="text-sm font-semibold text-gray-900 dark:text-white hover:text-teal-600 dark:hover:text-teal-400 truncate transition-colors"
            >
              {item.client.nom_entreprise}
            </button>
            {item.client.siren && (
              <span className="text-xs text-gray-400 hidden sm:inline">{item.client.siren}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">{item.type_exoneration}</span>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(item.date_debut).toLocaleDateString('fr-FR')} - {new Date(item.date_fin).toLocaleDateString('fr-FR')}
            </span>
          </div>
        </div>
        <div className="flex-shrink-0">
          {getRateBadge(item.currentRate, item.isExpired)}
        </div>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {sortedYears.map((year) => {
          const months = yearGroups.get(year)!;
          const isExpanded = expandedYears.has(year);
          const hasCurrentMonth = months.some((m) => m.month === currentMonth && m.year === currentYear);

          const allMonths = new Array(12).fill(null).map((_, idx) => {
            return months.find((m) => m.month === idx) || null;
          });

          const activeRates = months.filter((m) => m.rate > 0);
          const uniqueRates = [...new Set(activeRates.map((m) => m.rate))].sort((a, b) => b - a);

          return (
            <div key={year}>
              <button
                onClick={() => onToggleYear(year)}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors text-left"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <span className={`text-sm font-semibold ${hasCurrentMonth ? 'text-teal-700 dark:text-teal-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {year}
                </span>
                {hasCurrentMonth && (
                  <span className="text-[10px] font-medium text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/40 px-1.5 py-0.5 rounded">
                    En cours
                  </span>
                )}
                <div className="flex-1" />
                <div className="flex items-center gap-1">
                  {!isExpanded && (
                    <div className="hidden sm:flex items-center gap-0.5">
                      {allMonths.map((m, idx) => {
                        const isNow = idx === currentMonth && year === currentYear;
                        if (!m) {
                          return (
                            <div
                              key={idx}
                              className="w-5 h-5 rounded-sm bg-gray-50 dark:bg-gray-900/20 border border-dashed border-gray-200 dark:border-gray-700"
                            />
                          );
                        }
                        const colors = RATE_COLORS[m.rate] || RATE_COLORS[0];
                        return (
                          <div
                            key={idx}
                            className={`w-5 h-5 rounded-sm ${colors.bg} flex items-center justify-center ${
                              isNow ? 'ring-2 ring-teal-500 ring-offset-1 dark:ring-offset-gray-900' : ''
                            }`}
                            title={`${MONTH_LABELS[idx]} ${year} - ${m.rate}%`}
                          >
                            <span className={`text-[8px] font-bold ${colors.text}`}>
                              {m.rate > 0 ? m.rate : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {uniqueRates.length > 0 && (
                    <div className="flex items-center gap-1 sm:hidden">
                      {uniqueRates.map((r) => {
                        const colors = RATE_COLORS[r] || RATE_COLORS[0];
                        return (
                          <span key={r} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                            {r}%
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-4">
                  <div className="grid grid-cols-12 gap-1">
                    {allMonths.map((m, idx) => {
                      const isNow = idx === currentMonth && year === currentYear;
                      if (!m) {
                        return (
                          <div key={idx} className="flex flex-col items-center">
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">
                              {MONTH_LABELS[idx]}
                            </span>
                            <div className="w-full h-10 rounded-md bg-gray-50 dark:bg-gray-900/20 border border-dashed border-gray-200 dark:border-gray-700" />
                          </div>
                        );
                      }
                      const colors = RATE_COLORS[m.rate] || RATE_COLORS[0];
                      return (
                        <div key={idx} className="flex flex-col items-center">
                          <span className={`text-[10px] mb-1 ${
                            isNow ? 'font-bold text-teal-600 dark:text-teal-400' : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {MONTH_LABELS[idx]}
                          </span>
                          <div
                            className={`w-full h-10 rounded-md ${colors.cell} border ${
                              isNow
                                ? 'border-teal-400 dark:border-teal-500 ring-2 ring-teal-400/30 dark:ring-teal-500/30'
                                : m.isTransition
                                  ? 'border-amber-300 dark:border-amber-600'
                                  : 'border-gray-200 dark:border-gray-700'
                            } flex items-center justify-center transition-all`}
                          >
                            <span className={`text-xs font-bold ${colors.text}`}>
                              {m.rate > 0 ? `${m.rate}%` : '-'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {(() => {
                    const transitionMonths = allMonths.filter((m) => m?.isTransition);
                    if (transitionMonths.length === 0) return null;
                    return (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-sm border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 inline-block" />
                        Mois de transition (changement de taux)
                      </p>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
