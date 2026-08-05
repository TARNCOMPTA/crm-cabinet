import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  Search,
  Globe,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Settings,
  Link as LinkIcon,
} from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { CategoryFormModal } from '../components/directory/CategoryFormModal';
import { LinkFormModal } from '../components/directory/LinkFormModal';
import { ICON_MAP, getColorClasses } from '../components/directory/iconMap';
import { isSafeUrl } from '../lib/urlUtils';
import {
  fetchCategoriesWithLinks,
  createCategory,
  updateCategory,
  deleteCategory,
  createLink,
  updateLink,
  deleteLink,
  reorderCategories,
  reorderLinks,
  type DirectoryCategory,
  type DirectoryLink,
} from '../lib/webDirectoryService';

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function WebDirectory() {
  const { profile, isAdmin } = useAuth();
  const { showToast } = useToast();

  const [categories, setCategories] = useState<DirectoryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editMode, setEditMode] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<DirectoryCategory | null>(null);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingLink, setEditingLink] = useState<DirectoryLink | null>(null);
  const [defaultCategoryId, setDefaultCategoryId] = useState<string>('');

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'link'; id: string; name: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [profile]);

  async function loadData() {
    if (!profile) return;
    try {
      setLoading(true);
      const data = await fetchCategoriesWithLinks();
      setCategories(data);
    } catch {
      showToast('Erreur lors du chargement des liens utiles', 'error');
    } finally {
      setLoading(false);
    }
  }

  const filteredCategories = useMemo(() => {
    if (!searchTerm.trim()) return categories;
    const term = searchTerm.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        web_directory_links: cat.web_directory_links.filter(
          (link) =>
            link.title.toLowerCase().includes(term) ||
            (link.description || '').toLowerCase().includes(term) ||
            link.url.toLowerCase().includes(term)
        ),
      }))
      .filter((cat) => cat.web_directory_links.length > 0 || cat.name.toLowerCase().includes(term));
  }, [categories, searchTerm]);

  const totalLinks = useMemo(
    () => categories.reduce((sum, c) => sum + c.web_directory_links.length, 0),
    [categories]
  );

  async function handleCreateCategory(data: { name: string; description: string; icon: string; color: string }) {
    if (!profile) return;
    await createCategory(data);
    showToast('Catégorie créée', 'success');
    await loadData();
  }

  async function handleUpdateCategory(data: { name: string; description: string; icon: string; color: string }) {
    if (!editingCategory) return;
    await updateCategory(editingCategory.id, data);
    showToast('Catégorie modifiée', 'success');
    setEditingCategory(null);
    await loadData();
  }

  async function handleCreateLink(data: { title: string; url: string; description: string; category_id: string }) {
    if (!profile) return;
    await createLink(data.category_id, {
      title: data.title,
      url: data.url,
      description: data.description,
    });
    showToast('Lien ajouté', 'success');
    await loadData();
  }

  async function handleUpdateLink(data: { title: string; url: string; description: string; category_id: string }) {
    if (!editingLink) return;
    await updateLink(editingLink.id, data);
    showToast('Lien modifié', 'success');
    setEditingLink(null);
    await loadData();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'category') {
        await deleteCategory(deleteTarget.id);
        showToast('Catégorie supprimée', 'success');
      } else {
        await deleteLink(deleteTarget.id);
        showToast('Lien supprimé', 'success');
      }
      setDeleteTarget(null);
      await loadData();
    } catch {
      showToast('Erreur lors de la suppression', 'error');
    }
  }

  async function moveCategoryUp(index: number) {
    if (index === 0) return;
    const newOrder = [...categories];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setCategories(newOrder);
    try {
      await reorderCategories(newOrder.map((c) => c.id));
    } catch {
      showToast('Erreur lors du réordonnancement', 'error');
      await loadData();
    }
  }

  async function moveCategoryDown(index: number) {
    if (index === categories.length - 1) return;
    const newOrder = [...categories];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setCategories(newOrder);
    try {
      await reorderCategories(newOrder.map((c) => c.id));
    } catch {
      showToast('Erreur lors du réordonnancement', 'error');
      await loadData();
    }
  }

  async function moveLinkUp(catIndex: number, linkIndex: number) {
    if (linkIndex === 0) return;
    const newCats = [...categories];
    const links = [...newCats[catIndex].web_directory_links];
    [links[linkIndex - 1], links[linkIndex]] = [links[linkIndex], links[linkIndex - 1]];
    newCats[catIndex] = { ...newCats[catIndex], web_directory_links: links };
    setCategories(newCats);
    try {
      await reorderLinks(links.map((l) => l.id));
    } catch {
      showToast('Erreur lors du réordonnancement', 'error');
      await loadData();
    }
  }

  async function moveLinkDown(catIndex: number, linkIndex: number) {
    const cat = categories[catIndex];
    if (linkIndex === cat.web_directory_links.length - 1) return;
    const newCats = [...categories];
    const links = [...newCats[catIndex].web_directory_links];
    [links[linkIndex], links[linkIndex + 1]] = [links[linkIndex + 1], links[linkIndex]];
    newCats[catIndex] = { ...newCats[catIndex], web_directory_links: links };
    setCategories(newCats);
    try {
      await reorderLinks(links.map((l) => l.id));
    } catch {
      showToast('Erreur lors du réordonnancement', 'error');
      await loadData();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          <p className="mt-3 text-gray-600">Chargement des liens utiles...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Liens utiles</h1>
          <p className="text-gray-600 mt-1">
            {totalLinks} lien{totalLinks > 1 ? 's' : ''} dans {categories.length} catégorie{categories.length > 1 ? 's' : ''}
          </p>
        </div>
        {isAdmin && (
          <Button
            variant={editMode ? 'primary' : 'secondary'}
            onClick={() => setEditMode(!editMode)}
          >
            <Settings className="w-4 h-4 mr-2" />
            {editMode ? 'Terminer' : 'Gérer les liens'}
          </Button>
        )}
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input
          type="text"
          placeholder="Rechercher un site, un lien..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {editMode && (
        <div className="flex gap-3">
          <Button
            size="sm"
            onClick={() => {
              setEditingCategory(null);
              setShowCategoryModal(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            Ajouter une catégorie
          </Button>
        </div>
      )}

      {searchTerm && filteredCategories.length === 0 && (
        <div className="text-center py-16">
          <Search className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-3 text-lg font-medium text-gray-900">Aucun résultat</h3>
          <p className="mt-1 text-gray-500">Aucun lien ne correspond à "{searchTerm}"</p>
        </div>
      )}

      {!searchTerm && categories.length === 0 && (
        <div className="text-center py-16">
          <Globe className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-3 text-lg font-medium text-gray-900">Aucun lien utile</h3>
          <p className="mt-1 text-gray-500">
            {isAdmin ? 'Ajoutez des catégories et des liens pour commencer.' : 'Aucun lien disponible pour le moment.'}
          </p>
        </div>
      )}

      <div className="space-y-8">
        {(editMode ? categories : filteredCategories).map((category, catIndex) => {
          const colorClasses = getColorClasses(category.color);
          const IconComp = ICON_MAP[category.icon || ''] || Globe;
          const links = editMode ? category.web_directory_links : filteredCategories.find((c) => c.id === category.id)?.web_directory_links || [];

          if (!editMode && links.length === 0 && searchTerm) return null;

          return (
            <section key={category.id}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${colorClasses.bg} flex items-center justify-center`}>
                    <IconComp className={`w-5 h-5 ${colorClasses.text}`} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{category.name}</h2>
                    {category.description && (
                      <p className="text-sm text-gray-500">{category.description}</p>
                    )}
                  </div>
                </div>
                {editMode && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveCategoryUp(catIndex)}
                      disabled={catIndex === 0}
                      className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                      title="Monter"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveCategoryDown(catIndex)}
                      disabled={catIndex === categories.length - 1}
                      className="p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                      title="Descendre"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingCategory(category);
                        setShowCategoryModal(true);
                      }}
                      className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors"
                      title="Modifier"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ type: 'category', id: category.id, name: category.name })}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingLink(null);
                        setDefaultCategoryId(category.id);
                        setShowLinkModal(true);
                      }}
                      className="ml-1"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Lien
                    </Button>
                  </div>
                )}
              </div>

              {links.length === 0 && editMode && (
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                  <LinkIcon className="mx-auto h-8 w-8 text-gray-300" />
                  <p className="mt-2 text-sm text-gray-500">Aucun lien dans cette catégorie</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {links.map((link, linkIndex) => (
                  <div key={link.id} className="group relative">
                    {editMode ? (
                      <div className={`border rounded-xl p-4 bg-white transition-all border-l-4 ${colorClasses.border}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 truncate">{link.title}</h3>
                            {link.description && (
                              <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{link.description}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">{extractDomain(link.url)}</p>
                          </div>
                          <div className="flex items-center gap-0.5 ml-2 flex-shrink-0">
                            <button
                              onClick={() => moveLinkUp(catIndex, linkIndex)}
                              disabled={linkIndex === 0}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveLinkDown(catIndex, linkIndex)}
                              disabled={linkIndex === links.length - 1}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 transition-colors"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingLink(link);
                                setDefaultCategoryId(category.id);
                                setShowLinkModal(true);
                              }}
                              className="p-1 text-gray-400 hover:text-teal-600 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ type: 'link', id: link.id, name: link.title })}
                              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : isSafeUrl(link.url) ? (
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`block border rounded-xl p-4 bg-white hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-l-4 ${colorClasses.border}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-gray-900 group-hover:text-teal-600 transition-colors truncate">
                              {link.title}
                            </h3>
                            {link.description && (
                              <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{link.description}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-1.5">{extractDomain(link.url)}</p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-teal-500 transition-colors flex-shrink-0 ml-3 mt-0.5" />
                        </div>
                      </a>
                    ) : (
                      <div className="block border rounded-xl p-4 bg-gray-50 border-l-4 border-gray-300 opacity-60">
                        <h3 className="font-medium text-gray-500 truncate">{link.title}</h3>
                        <p className="text-xs text-red-400 mt-1">URL non valide</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <CategoryFormModal
        isOpen={showCategoryModal}
        onClose={() => {
          setShowCategoryModal(false);
          setEditingCategory(null);
        }}
        onSubmit={editingCategory ? handleUpdateCategory : handleCreateCategory}
        category={editingCategory}
      />

      <LinkFormModal
        isOpen={showLinkModal}
        onClose={() => {
          setShowLinkModal(false);
          setEditingLink(null);
        }}
        onSubmit={editingLink ? handleUpdateLink : handleCreateLink}
        link={editingLink}
        categories={categories}
        defaultCategoryId={defaultCategoryId}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={deleteTarget?.type === 'category' ? 'Supprimer la catégorie' : 'Supprimer le lien'}
        message={
          deleteTarget?.type === 'category'
            ? `Êtes-vous sûr de vouloir supprimer la catégorie "${deleteTarget?.name}" ? Tous les liens associés seront également supprimés.`
            : `Êtes-vous sûr de vouloir supprimer le lien "${deleteTarget?.name}" ?`
        }
        confirmText="Supprimer"
        cancelText="Annuler"
      />
    </div>
  );
}
