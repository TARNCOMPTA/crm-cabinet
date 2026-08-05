import { useState, useMemo, useEffect, useCallback } from 'react';
import { Button } from '../ui/Button';
import { ViewToggle, type ViewMode } from '../ui/ViewToggle';
import { ContactFormModal } from './ContactFormModal';
import { ContactDetailModal } from './ContactDetailModal';
import { ContactCard } from './ContactCard';
import { ContactTableView } from './ContactTableView';
import { ContactListView } from './ContactListView';
import { BulkEmailBar } from './BulkEmailBar';
import { exportContactsToExcel } from '../../lib/contactsDirectoryExport';
import { type CompanyWithContacts, type ContactWithCompanies } from '../../lib/contactsDirectoryService';
import { Plus, Search, Download, Users, Loader } from 'lucide-react';

const STORAGE_KEY = 'annuaire-view-mode';

function loadViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'grid' || stored === 'list' || stored === 'table') return stored;
  } catch {}
  return 'grid';
}

interface ContactsTabProps {
  contacts: ContactWithCompanies[];
  companies: CompanyWithContacts[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  highlightId?: string;
}

export function ContactsTab({ contacts, companies, loading, onRefresh, highlightId }: ContactsTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactWithCompanies | null>(null);
  const [detailContact, setDetailContact] = useState<ContactWithCompanies | null>(null);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (highlightId && !loading && contacts.length > 0) {
      const found = contacts.find((c) => c.id === highlightId);
      if (found) setDetailContact(found);
    }
  }, [highlightId, loading, contacts]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return contacts;
    const term = searchTerm.toLowerCase();
    return contacts.filter((c) =>
      c.first_name?.toLowerCase().includes(term) ||
      c.last_name?.toLowerCase().includes(term) ||
      c.role?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term) ||
      c.mobile?.toLowerCase().includes(term) ||
      c.directory_contact_companies?.some(
        (l) => l.directory_companies?.name?.toLowerCase().includes(term)
      )
    );
  }, [contacts, searchTerm]);

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
      await exportContactsToExcel(contacts);
    } finally {
      setExporting(false);
    }
  }

  function handleEdit(contact: ContactWithCompanies) {
    setEditingContact(contact);
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
            placeholder="Rechercher un contact..."
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
            disabled={exporting || contacts.length === 0}
          >
            {exporting ? <Loader className="w-4 h-4 animate-spin mr-1.5" /> : <Download className="w-4 h-4 mr-1.5" />}
            Exporter
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setEditingContact(null); setShowFormModal(true); }}
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
          <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            {searchTerm ? 'Aucun contact trouve' : 'Aucun contact dans l\'annuaire'}
          </p>
          {!searchTerm && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Ajoutez votre premier contact pour commencer
            </p>
          )}
        </div>
      ) : viewMode === 'table' ? (
        <ContactTableView
          contacts={filtered}
          selectedIds={selectedIds}
          hasSelection={hasSelection}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onClick={(c) => setDetailContact(c)}
          onEdit={handleEdit}
        />
      ) : viewMode === 'list' ? (
        <ContactListView
          contacts={filtered}
          selectedIds={selectedIds}
          hasSelection={hasSelection}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onClick={(c) => setDetailContact(c)}
          onEdit={handleEdit}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onClick={() => setDetailContact(contact)}
              onEdit={() => handleEdit(contact)}
              selected={selectedIds.has(contact.id)}
              hasSelection={hasSelection}
              onToggleSelect={() => handleToggleSelect(contact.id)}
            />
          ))}
        </div>
      )}

      <ContactFormModal
        isOpen={showFormModal}
        onClose={() => { setShowFormModal(false); setEditingContact(null); }}
        contact={editingContact}
        onSaved={onRefresh}
        companies={companies}
      />

      {detailContact && (
        <ContactDetailModal
          isOpen={!!detailContact}
          onClose={() => setDetailContact(null)}
          contact={detailContact}
          companies={companies}
          onRefresh={onRefresh}
          onEdit={() => {
            handleEdit(detailContact);
            setDetailContact(null);
          }}
        />
      )}
    </div>
  );
}
