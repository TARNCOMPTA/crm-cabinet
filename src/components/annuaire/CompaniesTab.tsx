import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from '../ui/Button';
import { ViewToggle, type ViewMode } from '../ui/ViewToggle';
import { CompanyFormModal } from './CompanyFormModal';
import { CompanyDetailModal } from './CompanyDetailModal';
import { CompanyCard } from './CompanyCard';
import { CompanyTableView } from './CompanyTableView';
import { CompanyListView } from './CompanyListView';
import { BulkEmailBar } from './BulkEmailBar';
import { exportCompaniesToExcel } from '../../lib/contactsDirectoryExport';
import { isClientCompany, type CompanyWithContacts, type ContactWithCompanies } from '../../lib/contactsDirectoryService';
import { Plus, Search, Download, Building2, Loader } from 'lucide-react';

const STORAGE_KEY = 'annuaire-view-mode';

function loadViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'grid' || stored === 'list' || stored === 'table') return stored;
  } catch {}
  return 'grid';
}

interface CompaniesTabProps {
  companies: CompanyWithContacts[];
  contacts: ContactWithCompanies[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  highlightId?: string;
}

export function CompaniesTab({ companies, contacts, loading, onRefresh, highlightId }: CompaniesTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyWithContacts | null>(null);
  const [detailCompany, setDetailCompany] = useState<CompanyWithContacts | null>(null);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());


  useEffect(() => {
    if (highlightId && !loading && companies.length > 0) {
      const found = companies.find((c) => c.id === highlightId);
      if (found) setDetailCompany(found);
    }
  }, [highlightId, loading, companies]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return companies;
    const term = searchTerm.toLowerCase();
    return companies.filter((c) => {
      const primaryContact = c.directory_contact_companies?.find((l) => l.is_primary_contact);
      const primaryName = primaryContact?.directory_contacts
        ? `${primaryContact.directory_contacts.first_name} ${primaryContact.directory_contacts.last_name}`.toLowerCase()
        : '';
      const clientExtra = isClientCompany(c)
        ? [c._contactPrincipal, c._dirigeant, c._numeroDossier].filter(Boolean).join(' ').toLowerCase()
        : '';
      return (
        c.name.toLowerCase().includes(term) ||
        c.siren?.toLowerCase().includes(term) ||
        c.siret?.toLowerCase().includes(term) ||
        c.city?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term) ||
        c.phone?.toLowerCase().includes(term) ||
        primaryName.includes(term) ||
        clientExtra.includes(term)
      );
    });
  }, [companies, searchTerm]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const filteredIdSet = new Set(filtered.map((c) => c.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (filteredIdSet.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const selectedEmails = useMemo(() => {
    return filtered
      .filter((c) => selectedIds.has(c.id))
      .map((c) => c.email)
      .filter(Boolean);
  }, [filtered, selectedIds]);

  function handleViewModeChange(mode: ViewMode) {
    setViewMode(mode);
    try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
  }

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = filtered.length > 0 && filtered.every((c) => prev.has(c.id));
      if (allSelected) return new Set();
      return new Set(filtered.map((c) => c.id));
    });
  }, [filtered]);

  async function handleExport() {
    setExporting(true);
    try {
      await exportCompaniesToExcel(companies);
    } finally {
      setExporting(false);
    }
  }

  function handleEdit(company: CompanyWithContacts) {
    if (isClientCompany(company)) return;
    setEditingCompany(company);
    setShowFormModal(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher une societe..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={viewMode} onChange={handleViewModeChange} />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || companies.length === 0}
          >
            {exporting ? <Loader className="w-4 h-4 animate-spin mr-1.5" /> : <Download className="w-4 h-4 mr-1.5" />}
            Exporter
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setEditingCompany(null); setShowFormModal(true); }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Ajouter
          </Button>
        </div>
      </div>

      {hasSelection && (
        <BulkEmailBar
          count={selectedIds.size}
          emails={selectedEmails}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            {searchTerm ? 'Aucune societe trouvee' : 'Aucune societe dans l\'annuaire'}
          </p>
          {!searchTerm && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Ajoutez votre premiere societe pour commencer
            </p>
          )}
        </div>
      ) : viewMode === 'table' ? (
        <CompanyTableView
          companies={filtered}
          selectedIds={selectedIds}
          hasSelection={hasSelection}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onClick={(c) => setDetailCompany(c)}
          onEdit={handleEdit}
        />
      ) : viewMode === 'list' ? (
        <CompanyListView
          companies={filtered}
          selectedIds={selectedIds}
          hasSelection={hasSelection}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onClick={(c) => setDetailCompany(c)}
          onEdit={handleEdit}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((company) => (
            <CompanyCard
              key={company.id}
              company={company}
              onClick={() => setDetailCompany(company)}
              onEdit={() => handleEdit(company)}
              selected={selectedIds.has(company.id)}
              hasSelection={hasSelection}
              onToggleSelect={() => handleToggleSelect(company.id)}
            />
          ))}
        </div>
      )}

      <CompanyFormModal
        isOpen={showFormModal}
        onClose={() => { setShowFormModal(false); setEditingCompany(null); }}
        company={editingCompany}
        onSaved={onRefresh}
      />

      {detailCompany && (
        <CompanyDetailModal
          isOpen={!!detailCompany}
          onClose={() => setDetailCompany(null)}
          company={detailCompany}
          contacts={contacts}
          onRefresh={onRefresh}
          onEdit={() => {
            handleEdit(detailCompany);
            setDetailCompany(null);
          }}
        />
      )}
    </div>
  );
}
