import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Card, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  MapPin,
  RotateCcw,
  Search,
  Loader2,
  Users,
  Map,
  Building2,
  AlertCircle,
} from 'lucide-react';

const CommuneMap = lazy(() =>
  import('./CommuneMap').then((m) => ({ default: m.CommuneMap }))
);

interface Commune {
  nom: string;
  code: string;
  codesPostaux: string[];
  departement?: { code: string; nom: string };
  region?: { code: string; nom: string };
  population?: number;
  surface?: number;
  centre?: { type: string; coordinates: [number, number] };
}

const GEO_API = 'https://geo.api.gouv.fr';
const COMMUNE_FIELDS =
  'nom,code,codesPostaux,departement,region,population,surface,centre';

function formatPopulation(pop: number): string {
  return new Intl.NumberFormat('fr-FR').format(pop);
}

function formatSurface(hectares: number): string {
  const km2 = hectares / 100;
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(km2);
}

async function searchCommunes(query: string): Promise<Commune[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const isNumeric = /^\d+$/.test(trimmed);

  if (isNumeric && trimmed.length >= 2 && trimmed.length <= 5) {
    const res = await fetch(
      `${GEO_API}/communes?codePostal=${trimmed}&fields=${COMMUNE_FIELDS}&boost=population&format=json&geometry=centre`
    );
    if (!res.ok) throw new Error('Erreur API');
    const data: Commune[] = await res.json();
    if (data.length > 0) return data;

    if (trimmed.length <= 3) {
      const deptRes = await fetch(
        `${GEO_API}/departements/${trimmed}/communes?fields=${COMMUNE_FIELDS}&format=json&geometry=centre&limit=50`
      );
      if (deptRes.ok) {
        const deptData: Commune[] = await deptRes.json();
        return deptData;
      }
    }
    return [];
  }

  if (!isNumeric && trimmed.length >= 2) {
    const res = await fetch(
      `${GEO_API}/communes?nom=${encodeURIComponent(trimmed)}&fields=${COMMUNE_FIELDS}&boost=population&limit=20&format=json&geometry=centre`
    );
    if (!res.ok) throw new Error('Erreur API');
    return res.json();
  }

  return [];
}

export function PostalCodeLookup() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Commune[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [selected, setSelected] = useState<Commune | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      if (!trimmed) {
        setResults([]);
        setHasSearched(false);
        setSelected(null);
        setError('');
      }
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const data = await searchCommunes(trimmed);
        setResults(data);
        setHasSearched(true);
        setSelected(null);
      } catch {
        setError('Impossible de contacter le service. Verifiez votre connexion.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const reset = () => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setSelected(null);
    setError('');
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                label="Rechercher une commune"
                placeholder="Code postal, nom de commune ou numero de departement..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                icon={<Search className="w-4 h-4" />}
                helperText="Saisissez au moins 2 caracteres pour lancer la recherche"
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reinitialiser
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
          <span className="ml-3 text-sm text-gray-500 dark:text-gray-400">
            Recherche en cours...
          </span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {!loading && hasSearched && results.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <Search className="w-7 h-7 text-gray-400" />
            </div>
            <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">
              Aucun resultat
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Aucune commune ne correspond a votre recherche. Verifiez l'orthographe ou essayez un autre terme.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {results.length} commune{results.length > 1 ? 's' : ''} trouvee{results.length > 1 ? 's' : ''}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((commune) => {
              const isSelected = selected?.code === commune.code;
              return (
                <button
                  key={commune.code}
                  onClick={() => setSelected(isSelected ? null : commune)}
                  className={`text-left w-full transition-all duration-200 rounded-lg border overflow-hidden ${
                    isSelected
                      ? 'border-rose-300 dark:border-rose-700 ring-2 ring-rose-500 bg-rose-50/50 dark:bg-rose-950/20'
                      : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm'
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-950 flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {commune.nom}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Code INSEE : {commune.code}
                          </p>
                        </div>
                      </div>
                      {isSelected && (
                        <Map className="w-4 h-4 text-rose-500 flex-shrink-0 mt-1" />
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {commune.codesPostaux.map((cp) => (
                        <Badge key={cp} variant="default">
                          {cp}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {commune.departement && (
                        <Badge variant="info">
                          {commune.departement.nom} ({commune.departement.code})
                        </Badge>
                      )}
                      {commune.region && (
                        <Badge variant="orange">
                          {commune.region.nom}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      {commune.population != null && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {formatPopulation(commune.population)} hab.
                        </span>
                      )}
                      {commune.surface != null && commune.surface > 0 && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {formatSurface(commune.surface)} km²
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {selected?.centre && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-4">
              <Map className="w-4 h-4 text-rose-500" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Localisation de {selected.nom}
              </p>
            </div>
            <Suspense
              fallback={
                <div className="h-[350px] rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
                </div>
              }
            >
              <CommuneMap
                lat={selected.centre.coordinates[1]}
                lng={selected.centre.coordinates[0]}
                name={selected.nom}
                department={
                  selected.departement
                    ? `${selected.departement.nom} (${selected.departement.code})`
                    : ''
                }
              />
            </Suspense>
          </CardContent>
        </Card>
      )}

      {!hasSearched && !loading && (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
              Recherche de Communes
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Saisissez un code postal, un nom de commune ou un numero de departement pour afficher les informations administratives et la localisation geographique.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
