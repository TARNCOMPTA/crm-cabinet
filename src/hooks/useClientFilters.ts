import { useState, useMemo, useEffect, useCallback, useDeferredValue } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ClientListe } from '../components/clients/colonnesListe';

/**
 * ⚠️ CE TYPE EST PLUS ÉTROIT QUE LA LIGNE COMPLÈTE, ET C'EST LE POINT. La liste
 * ne demande à la base que les colonnes qu'elle affiche ; lire ici une colonne
 * absente de `COLONNES_LISTE` ne compile pas, au lieu d'arriver `undefined` à
 * l'écran. Voir `colonnesListe.ts`.
 */
type Client = ClientListe;

export type SortField = 'nom_entreprise' | 'dirigeant' | 'numero_dossier' | 'siren' | 'siret' | 'ville' | 'regime_fiscal' | 'date_cloture' | 'collaborators';

export interface ClientFiltersState {
  searchTerm: string;
  filterStatus: string;
  filterRegime: string;
  filterCloture: string;
  filterCollaboratorIds: string[];
  showArchived: boolean;
  sortField: SortField;
  sortDirection: 'asc' | 'desc';
  showFilters: boolean;
}

export function useClientFilters(clients: Client[], userId?: string, showMyDossiers?: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('q') ?? '');
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') ?? 'all');
  const [filterRegime, setFilterRegime] = useState(() => searchParams.get('regime') ?? 'all');
  const [filterCloture, setFilterCloture] = useState(() => searchParams.get('cloture') ?? 'all');
  const [filterCollaboratorIds, setFilterCollaboratorIds] = useState<string[]>(() => {
    const raw = searchParams.get('collab');
    return raw ? raw.split(',').filter(Boolean) : [];
  });
  const [showArchived, setShowArchived] = useState(() => searchParams.get('archived') === '1');
  const [sortField, setSortField] = useState<SortField>(
    () => (searchParams.get('sort') as SortField) || 'nom_entreprise'
  );
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    () => (searchParams.get('dir') === 'desc' ? 'desc' : 'asc')
  );
  const [showFilters, setShowFilters] = useState(() =>
    Array.from(searchParams.keys()).some((k) =>
      ['status', 'regime', 'cloture', 'collab', 'archived'].includes(k)
    )
  );

  // URL sync
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const setOrDelete = (key: string, value: string | null | undefined, defaultValue?: string) => {
      if (value && value !== defaultValue && value !== '') {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    };
    setOrDelete('q', searchTerm.trim());
    setOrDelete('status', filterStatus, 'all');
    setOrDelete('regime', filterRegime, 'all');
    setOrDelete('cloture', filterCloture, 'all');
    setOrDelete('collab', filterCollaboratorIds.join(','));
    setOrDelete('archived', showArchived ? '1' : '');
    setOrDelete('sort', sortField, 'nom_entreprise');
    setOrDelete('dir', sortDirection, 'asc');
    next.delete('create');
    next.delete('name');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [searchTerm, filterStatus, filterRegime, filterCloture, filterCollaboratorIds, showArchived, sortField, sortDirection, searchParams, setSearchParams]);

  const handleSortToggle = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const toggleCollaboratorFilter = useCallback((uid: string) => {
    setFilterCollaboratorIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  }, []);

  const activeFilterCount =
    (filterStatus !== 'all' ? 1 : 0) +
    (filterRegime !== 'all' ? 1 : 0) +
    (filterCloture !== 'all' ? 1 : 0) +
    (filterCollaboratorIds.length > 0 ? 1 : 0) +
    (showArchived ? 1 : 0);

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setFilterStatus('all');
    setFilterRegime('all');
    setFilterCloture('all');
    setFilterCollaboratorIds([]);
    setShowArchived(false);
  }, []);

  // Filter & sort
  /**
   * LA RECHERCHE EST DIFFÉRÉE, LE CHAMP NE L'EST PAS.
   *
   * `useDeferredValue` ne rend rien plus rapide : il change QUI ATTEND. Le champ
   * se peint tout de suite avec la frappe, et React recalcule la liste dans une
   * passe de moindre priorité, qu'une frappe suivante peut interrompre. Une
   * temporisation aurait figé le champ pendant le délai ; ici la lettre paraît
   * quoi qu'il arrive.
   *
   * MESURÉ, avec témoin, à 403 dossiers — chronométrage DANS la page, car les
   * aller-retours d'un pilote de navigateur ajoutent des dizaines de
   * millisecondes et avaient d'abord fait conclure à un défaut deux fois plus
   * gros qu'il n'est :
   *
   *                        sans différé   avec
   *     réponse du champ      48 ms       38 ms   (1re frappe : 120 → 55)
   *     liste posée           86 ms       73 ms   (1re frappe : 182 → 96)
   *
   * Le gain est donc MODESTE en régime, net sur la première frappe — celle où
   * la liste se réduit d'un coup, et la seule que l'on remarque vraiment.
   *
   * ⚠️ CE N'EST PAS LE FILTRAGE QUI COÛTE, et il ne sert à rien de l'optimiser :
   * chronométré à part, filtrer et trier 403 clients prend 0,15 ms. Le temps
   * part dans le rendu des cinquante lignes, soit 5 300 nœuds. Ce qui le
   * réduirait vraiment — mémoïser la ligne, ne pas monter dnd-kit quand le
   * glisser-déposer est éteint — demande une refonte du tableau, écartée tant
   * que la réponse du champ reste sous les 50 ms.
   *
   * ⚠️ LE RESTE DE L'ÉCRAN LIT TOUJOURS `searchTerm`, pas cette valeur : l'URL
   * partageable et le compteur de filtres actifs doivent suivre la frappe, pas
   * le rendu.
   */
  const rechercheDifferee = useDeferredValue(searchTerm);

  const filteredClients = useMemo(() => {
    const terme = rechercheDifferee;
    const filtered = clients.filter((client) => {
      const matchesSearch =
        client.nom_entreprise.toLowerCase().includes(terme.toLowerCase()) ||
        client.siret?.includes(terme) ||
        client.numero_dossier?.toLowerCase().includes(terme.toLowerCase()) ||
        client.contact_principal?.toLowerCase().includes(terme.toLowerCase()) ||
        client.dirigeant?.toLowerCase().includes(terme.toLowerCase()) ||
        // « Gaillac » etait introuvable : la ville n'existait que noyee dans la
        // chaine d'adresse, que cette recherche ne regardait pas.
        client.ville?.toLowerCase().includes(terme.toLowerCase());

      const matchesStatus = filterStatus === 'all' || client.statut === filterStatus;
      const matchesRegime = filterRegime === 'all' || client.regime_fiscal === filterRegime;
      const matchesArchived = showArchived || client.statut !== 'archive';
      const matchesCloture =
        filterCloture === 'all' ||
        (client.date_cloture && client.date_cloture.substring(5, 7) === filterCloture);
      const matchesCollaborators =
        filterCollaboratorIds.length === 0 ||
        filterCollaboratorIds.every((uid) =>
          client.collaborators?.some((c) => c.user_id === uid)
        );
      const matchesDossier =
        !showMyDossiers || client.collaborators?.some((c) => c.user_id === userId);

      return matchesSearch && matchesStatus && matchesRegime && matchesArchived && matchesCloture && matchesCollaborators && matchesDossier;
    });

    const dir = sortDirection === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      if (sortField === 'collaborators') {
        aVal = a.collaborators?.length ?? 0;
        bVal = b.collaborators?.length ?? 0;
      } else if (sortField === 'date_cloture') {
        aVal = a.date_cloture || '';
        bVal = b.date_cloture || '';
      } else {
        aVal = (a[sortField] || '') as string;
        bVal = (b[sortField] || '') as string;
      }

      if (!aVal && aVal !== 0) return 1;
      if (!bVal && bVal !== 0) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * dir;
      }

      return String(aVal).localeCompare(String(bVal), 'fr') * dir;
    });

    return filtered;
  }, [clients, rechercheDifferee, filterStatus, filterRegime, showArchived, filterCloture, filterCollaboratorIds, showMyDossiers, sortField, sortDirection, userId]);

  return {
    // State
    searchTerm,
    filterStatus,
    filterRegime,
    filterCloture,
    filterCollaboratorIds,
    showArchived,
    sortField,
    sortDirection,
    showFilters,
    activeFilterCount,
    filteredClients,
    // Setters
    setSearchTerm,
    setFilterStatus,
    setFilterRegime,
    setFilterCloture,
    setShowArchived,
    setShowFilters,
    // Actions
    handleSortToggle,
    toggleCollaboratorFilter,
    resetFilters,
  };
}
