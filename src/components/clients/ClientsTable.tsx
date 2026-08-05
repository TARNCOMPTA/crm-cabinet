import { Link } from 'react-router-dom';
import {
  Building,
  FileText,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Mail,
  Pencil,
} from 'lucide-react';
import { CopyButton } from '../ui/CopyButton';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { LegalFormDisplay } from './LegalFormDisplay';
import { CollaboratorAvatarGroup } from '../ui/CollaboratorAvatarGroup';
import { SortableTableWrapper } from '../ui/SortableTableWrapper';
import { SortableRow } from '../ui/SortableRow';
import type { SortField } from '../../hooks/useClientFilters';
import type { Database } from '../../types/database';

type Client = Database['public']['Tables']['clients']['Row'] & {
  collaborators?: Array<{
    id: string;
    user_id: string;
    // `client_collaborators.role` : DEFAULT sans NOT NULL, donc nullable.
    role: string | null;
    user?: { prenom: string | null; nom: string | null; avatar_color?: string | null } | null;
  }>;
};

interface ColumnDef {
  field: SortField;
  label: string;
}

const TABLE_COLUMNS: ColumnDef[] = [
  { field: 'nom_entreprise', label: 'Entreprise' },
  { field: 'dirigeant', label: 'Dirigeant' },
  { field: 'numero_dossier', label: 'N Dossier' },
  { field: 'siren', label: 'SIREN' },
  { field: 'siret', label: 'SIRET' },
  // La ville, et PAS le numero de TVA : sept colonnes suffisent, et un numero de
  // TVA est une donnee de fiche que personne ne parcourt en liste.
  { field: 'ville', label: 'Ville' },
  { field: 'regime_fiscal', label: 'Regime' },
  { field: 'date_cloture', label: 'Cloture' },
];

interface Props {
  clients: Client[];
  displayIds: string[];
  selectedClientIds: Set<string>;
  sortField: SortField;
  sortDirection: 'asc' | 'desc';
  useCustomOrder: boolean;
  onSortToggle: (field: SortField) => void;
  onToggleSelection: (clientId: string) => void;
  onToggleSelectAll: () => void;
  onOpenAssignModal: (client: Client) => void;
  onDragEnd: (event: any) => void;
}

export function ClientsTable({
  clients,
  displayIds,
  selectedClientIds,
  sortField,
  sortDirection,
  useCustomOrder,
  onSortToggle,
  onToggleSelection,
  onToggleSelectAll,
  onOpenAssignModal,
  onDragEnd,
}: Props) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <SortableTableWrapper ids={displayIds} onDragEnd={onDragEnd}>
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="w-10 py-3 px-3">
                  <input
                    type="checkbox"
                    checked={selectedClientIds.size === clients.length && clients.length > 0}
                    onChange={onToggleSelectAll}
                    className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                  />
                </th>
                {useCustomOrder && <th className="w-8 py-3 px-1" />}
                {TABLE_COLUMNS.map((col) => (
                  <th
                    key={col.field}
                    className="text-left py-3 px-4 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => onSortToggle(col.field)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortField === col.field ? (
                        sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </span>
                  </th>
                ))}
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Statut
                </th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                  Email
                </th>
                <th
                  className="text-left py-3 px-4 text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => onSortToggle('collaborators')}
                >
                  <span className="inline-flex items-center gap-1">
                    Collab.
                    {sortField === 'collaborators' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                    )}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
              {clients.map((client) => (
                <SortableRow
                  key={client.id}
                  id={client.id}
                  disabled={!useCustomOrder}
                  className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                    client.statut === 'archive' ? 'opacity-60 bg-gray-50 dark:bg-gray-800' : ''
                  } ${selectedClientIds.has(client.id) ? 'bg-teal-50/50 dark:bg-teal-900/10' : ''}`}
                >
                  <td className="py-4 px-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedClientIds.has(client.id)}
                      onChange={() => onToggleSelection(client.id)}
                      className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                    />
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-teal-100 dark:bg-teal-900/40 rounded-lg flex items-center justify-center">
                        <Building className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/clients/${client.id}`}
                            className="font-medium text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400 hover:underline transition-colors"
                          >
                            {client.nom_entreprise}
                          </Link>
                          <CopyButton value={client.nom_entreprise} label="Nom" />
                        </div>
                        {client.forme_juridique && (
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            <LegalFormDisplay value={client.forme_juridique} />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <CellValue value={client.dirigeant} />
                  </td>
                  <td className="py-4 px-4">
                    {client.numero_dossier ? (
                      <div className="flex items-center text-sm text-gray-900 dark:text-gray-100">
                        <FileText className="w-4 h-4 mr-1.5 text-gray-400" />
                        {client.numero_dossier}
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    {client.siren ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">{client.siren}</span>
                        <CopyButton value={client.siren} label="SIREN" />
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    {client.siret ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">{client.siret}</span>
                        <CopyButton value={client.siret} label="SIRET" />
                        <a
                          href={`https://api-avis-situation-sirene.insee.fr/identification/pdf/${client.siret}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                          title="Avis de situation INSEE"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    <CellValue value={client.ville} />
                  </td>
                  <td className="py-4 px-4">
                    <CellValue value={client.regime_fiscal} />
                  </td>
                  <td className="py-4 px-4">
                    {client.date_cloture ? (
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {new Date(client.date_cloture).toLocaleDateString('fr-FR', { month: 'long' })}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    <Badge
                      variant={
                        client.statut === 'actif'
                          ? 'success'
                          : client.statut === 'prospect'
                          ? 'blue'
                          : 'warning'
                      }
                    >
                      {client.statut}
                    </Badge>
                  </td>
                  <td className="py-4 px-4">
                    {client.email ? (
                      <div className="flex items-center gap-0.5">
                        <a
                          href={`mailto:${client.email}`}
                          className="inline-flex items-center gap-1.5 text-sm text-gray-900 dark:text-gray-100 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Mail className="w-3.5 h-3.5 text-gray-400" />
                          <span className="truncate max-w-[180px]">{client.email}</span>
                        </a>
                        {/* Les lignes sont glissables pour etre reordonnees :
                            comme la case a cocher et le lien ci-dessus, le
                            bouton retient le clic pour qu'il ne parte pas au
                            gestionnaire de glisser-deposer. */}
                        <span onClick={(e) => e.stopPropagation()}>
                          <CopyButton value={client.email} label="Email" />
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenAssignModal(client); }}
                      className="group/collab flex items-center gap-2 rounded-lg px-2 py-1 -mx-2 -my-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      title="Modifier les collaborateurs"
                    >
                      <CollaboratorAvatarGroup
                        collaborators={(client.collaborators || []).map((c) => ({
                          user_id: c.user_id,
                          full_name: `${c.user?.prenom || ''} ${c.user?.nom || ''}`.trim() || 'Utilisateur',
                          role: c.role,
                          avatar_color: (c.user as any)?.avatar_color || null,
                        }))}
                        size="small"
                      />
                      <Pencil className="w-3 h-3 text-gray-400 opacity-0 group-hover/collab:opacity-100 transition-opacity flex-shrink-0" />
                    </button>
                  </td>
                </SortableRow>
              ))}
            </tbody>
          </table>
        </SortableTableWrapper>
      </div>
    </Card>
  );
}

function CellValue({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-gray-400 dark:text-gray-500">-</span>;
  return <span className="text-sm text-gray-900 dark:text-gray-100">{value}</span>;
}
