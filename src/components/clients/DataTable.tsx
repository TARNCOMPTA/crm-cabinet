import { ReactNode } from 'react';
import { CopyButton } from '../ui/CopyButton';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

/**
 * Une ligne de fiche client.
 *
 * `export` pour que les tableaux de lignes de `ClientDetail` soient TYPES : sans
 * cela ils sont des `any[]`, et une faute de frappe sur un nom de colonne passe
 * en silence — le champ affiche « - » et l'enregistrement n'ecrit rien.
 */
export interface DataTableRow {
  label: string;
  value: string | number | null | undefined;
  copyable?: boolean;
  copyLabel?: string;
  customDisplay?: ReactNode;
  customEditDisplay?: ReactNode;
  editField?: 'input' | 'select' | 'date' | 'number' | 'textarea';
  /**
   * Ce que le champ contient, et ce qu'il rend.
   *
   * `editField` decide du composant — texte, date, nombre, liste, zone de
   * texte — et chacun ne produit qu'une chaine ou un nombre. `any` autorisait
   * a brancher un objet sur un `<input>`, ce qui aurait affiche « [object
   * Object] » sans que rien ne le signale.
   */
  editValue?: string | number | null;
  onChange?: (value: string) => void;
  selectOptions?: { value: string; label: string }[];
  /**
   * Identite stable de la ligne.
   *
   * PAS COSMETIQUE : le rendu utilisait `key={index}`. Quand le nombre de lignes
   * change — une bascule qui remplace « Raison sociale » par « Civilite / Nom /
   * Prenom » — React reassocie les lignes par position, et TOUS les champs
   * suivants perdent le focus et la position du curseur au milieu d'une saisie.
   */
  key?: string;
  /** Champ sur toute la largeur : une rue ne tient pas dans `max-w-md`. */
  wide?: boolean;
  /** Precision sous le champ, en edition comme en lecture. */
  helperText?: string;
}

interface DataTableProps {
  rows: DataTableRow[];
  editMode?: boolean;
}

/**
 * `overflow-x-auto` et non `overflow-hidden` : la table est en `min-w-full`, donc
 * elle a le droit de depasser son conteneur. « hidden » COUPAIT le debordement
 * au lieu de le faire defiler — sur un telephone, les colonnes de droite
 * devenaient inatteignables, sans rien pour le signaler.
 */
export function DataTable({ rows, editMode = false }: DataTableProps) {
  return (
    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          {rows.map((row, index) => (
            <tr key={row.key ?? index} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 w-1/3 bg-gray-50 dark:bg-gray-800/40">
                {row.label}
              </td>
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                {editMode && (row.editField || row.customEditDisplay) ? (
                  <div className={row.wide ? 'w-full' : 'max-w-md'}>
                    {row.customEditDisplay ? (
                      row.customEditDisplay
                    ) : row.editField === 'select' && row.selectOptions ? (
                      <Select
                        value={row.editValue || ''}
                        onChange={(e) => row.onChange?.(e.target.value)}
                      >
                        <option value="">Selectionner...</option>
                        {row.selectOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </Select>
                    ) : row.editField === 'textarea' ? (
                      <textarea
                        value={row.editValue || ''}
                        onChange={(e) => row.onChange?.(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    ) : (
                      <Input
                        type={row.editField === 'date' ? 'date' : row.editField === 'number' ? 'number' : 'text'}
                        value={row.editValue || ''}
                        onChange={(e) => row.onChange?.(e.target.value)}
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    {row.customDisplay ? (
                      row.customDisplay
                    ) : (
                      <span>{row.value || '-'}</span>
                    )}
                    {row.copyable && row.value && !editMode && (
                      <CopyButton
                        value={String(row.value)}
                        label={row.copyLabel || row.label}
                      />
                    )}
                  </div>
                )}
                {/*
                  Hors du ternaire : la precision vaut dans les deux modes. En
                  lecture elle explique d'ou vient une valeur (« recompose
                  automatiquement »), en edition ce qu'on attend du champ.
                */}
                {row.helperText && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{row.helperText}</p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
