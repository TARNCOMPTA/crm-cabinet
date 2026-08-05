import { useState, useEffect, useRef } from 'react';
import { X, Search, FileText, Square, Building2 } from 'lucide-react';
import {
  loadTemplates,
  searchClients,
  type ChecklistTemplateWithItems,
} from '../../lib/checklistService';

interface Props {
  userId: string;
  onClose: () => void;
  onCreate: (
    title: string,
    isShared: boolean,
    template: ChecklistTemplateWithItems | null,
    clientId: string | null
  ) => Promise<void>;
}

export function CreateChecklistModal({ userId, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [templates, setTemplates] = useState<ChecklistTemplateWithItems[]>([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ChecklistTemplateWithItems | null>(null);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);

  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Array<{ id: string; nom_entreprise: string; numero_dossier: string | null }>>([]);
  const [selectedClient, setSelectedClient] = useState<{ id: string; nom_entreprise: string } | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);

  const clientSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (userId) {
      loadTemplates(userId).then(setTemplates).catch(() => {});
    }
  }, [userId]);

  const filteredTemplates = templates.filter((t) =>
    t.title.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const handleClientSearch = (query: string) => {
    setClientSearch(query);
    if (clientSearchTimeout.current) clearTimeout(clientSearchTimeout.current);
    if (!query.trim()) {
      setClientResults([]);
      setShowClientDropdown(false);
      return;
    }
    setLoadingClients(true);
    clientSearchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchClients(query.trim());
        setClientResults(results);
        setShowClientDropdown(true);
      } catch {
        setClientResults([]);
      } finally {
        setLoadingClients(false);
      }
    }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = title.trim() || selectedTemplate?.title || '';
    if (!finalTitle) return;
    setSubmitting(true);
    try {
      await onCreate(finalTitle, isShared, selectedTemplate, selectedClient?.id || null);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = (title.trim() || selectedTemplate) && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Nouvelle checklist
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Titre
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selectedTemplate ? selectedTemplate.title : 'Ex: Cloture annuelle, Onboarding client...'}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
              autoFocus
            />
            {selectedTemplate && !title.trim() && (
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Le titre du modele sera utilise par defaut
              </p>
            )}
          </div>

          {/* Template search */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Modele (optionnel)
            </label>
            {selectedTemplate ? (
              <div className="border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                    <span className="text-sm font-medium text-teal-700 dark:text-teal-300">
                      {selectedTemplate.title}
                    </span>
                    <span className="text-xs text-teal-500 dark:text-teal-400">
                      ({selectedTemplate.items.length} element{selectedTemplate.items.length > 1 ? 's' : ''})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate(null)}
                    className="p-0.5 rounded hover:bg-teal-100 dark:hover:bg-teal-900 text-teal-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {selectedTemplate.items.length > 0 && (
                  <ul className="mt-2 space-y-0.5 max-h-32 overflow-y-auto">
                    {selectedTemplate.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-2 text-xs text-teal-600 dark:text-teal-400">
                        <Square className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={templateSearch}
                  onChange={(e) => {
                    setTemplateSearch(e.target.value);
                    setShowTemplateDropdown(true);
                  }}
                  onFocus={() => setShowTemplateDropdown(true)}
                  placeholder="Rechercher un modele..."
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                />
                {showTemplateDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowTemplateDropdown(false)} />
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredTemplates.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                          {templates.length === 0 ? 'Aucun modele disponible' : 'Aucun resultat'}
                        </div>
                      ) : (
                        filteredTemplates.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setSelectedTemplate(t);
                              setShowTemplateDropdown(false);
                              setTemplateSearch('');
                              if (!title.trim()) setTitle(t.title);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="flex-1 truncate">{t.title}</span>
                            <span className="text-xs text-gray-400">{t.items.length} el.</span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Client search */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Client (optionnel)
            </label>
            {selectedClient ? (
              <div className="flex items-center gap-2 px-3 py-2.5 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="flex-1 text-sm font-medium text-amber-700 dark:text-amber-300 truncate">
                  {selectedClient.nom_entreprise}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedClient(null)}
                  className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900 text-amber-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => handleClientSearch(e.target.value)}
                  onFocus={() => {
                    if (clientResults.length > 0) setShowClientDropdown(true);
                  }}
                  placeholder="Rechercher un client..."
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                />
                {loadingClients && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-teal-500 rounded-full animate-spin" />
                  </div>
                )}
                {showClientDropdown && clientResults.length > 0 && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowClientDropdown(false)} />
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {clientResults.map((cl) => (
                        <button
                          key={cl.id}
                          type="button"
                          onClick={() => {
                            setSelectedClient({ id: cl.id, nom_entreprise: cl.nom_entreprise });
                            setShowClientDropdown(false);
                            setClientSearch('');
                            setClientResults([]);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="flex-1 truncate">{cl.nom_entreprise}</span>
                          {cl.numero_dossier && (
                            <span className="text-xs text-gray-400">#{cl.numero_dossier}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Shared toggle */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isShared}
                  onChange={(e) => setIsShared(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-gray-200 dark:bg-gray-700 rounded-full peer-checked:bg-teal-500 transition-colors" />
                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Visible par le cabinet
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Les autres membres pourront voir cette checklist (en lecture seule)
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creation...' : 'Creer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
