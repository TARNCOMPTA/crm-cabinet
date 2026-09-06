import { Select } from '../ui/Select';

interface MonthPickerProps {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  required?: boolean;
}

/**
 * Les douze mois, DECEMBRE EN TETE : c'est la cloture de la grande majorite des
 * dossiers, et la mettre en premier evite de derouler toute la liste pour le cas
 * courant. L'ordre n'est donc pas un oubli.
 *
 * Exportee pour la saisie de cloture dans la liste des clients
 * (ClientsTable.tsx) : deux listes de mois finiraient par diverger sur cet ordre
 * precis, qui est le seul detail qui compte ici.
 */
export const MOIS_CLOTURE = [
  { value: '12', label: 'Décembre' },
  { value: '01', label: 'Janvier' },
  { value: '02', label: 'Février' },
  { value: '03', label: 'Mars' },
  { value: '04', label: 'Avril' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juin' },
  { value: '07', label: 'Juillet' },
  { value: '08', label: 'Août' },
  { value: '09', label: 'Septembre' },
  { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' },
];

/**
 * Le libellé français d'un mois, de son numéro « 01 » à « 12 », ou `undefined`.
 *
 * ⚠️ EXISTE POUR TUER UNE LISTE JUMELLE. `ClientDetail` portait ses propres
 * douze mois, SANS ACCENTS — la fiche affichait donc « Decembre » en lecture et
 * « Décembre » dans la liste déroulante juste à côté, sur le même écran. Deux
 * listes du même contenu finissent toujours par diverger ; celle-ci est la
 * seule, et elle sert aux deux usages.
 */
export function libelleMois(numero: string): string | undefined {
  return MOIS_CLOTURE.find((m) => m.value === numero)?.label;
}

export function MonthPicker({ value, onChange, label = 'Mois de clôture', required = false }: MonthPickerProps) {
  const month = value ? value.substring(5, 7) : '';

  /**
   * ⚠️ « SÉLECTIONNER UN MOIS » N'EST PAS UN MOIS, et il ne faut surtout pas en
   * fabriquer une date.
   *
   * Cette fonction composait `${annee}-${mois}-01` sans regarder `mois`. Sur
   * l'option vide, elle produisait la chaîne `2026--01` — ni une date, ni un
   * vide, mais une valeur inventée que la fiche envoyait ensuite à la base :
   *
   *     PATCH /clients  {"date_cloture":"2026--01"}
   *       -> 400  22007  invalid input syntax for type date: "2026--01"
   *
   * Résultat : remettre la clôture à vide faisait échouer l'enregistrement de
   * TOUTE la fiche, avec un message de syntaxe de date. Reproduit contre la
   * vraie base le 2026-09-05.
   *
   * Le vide se transmet donc comme vide, et `lib/champsClient.ts` le convertit
   * en `null` au moment de l'envoi — une seule règle, un seul endroit.
   */
  const handleMonthChange = (newMonth: string) => {
    if (!newMonth) {
      onChange('');
      return;
    }
    const currentYear = new Date().getFullYear();
    onChange(`${currentYear}-${newMonth}-01`);
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <Select
        value={month}
        onChange={(e) => handleMonthChange(e.target.value)}
        required={required}
      >
        <option value="">Sélectionner un mois</option>
        {MOIS_CLOTURE.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>
      {value && (
        <p className="mt-1 text-xs text-gray-500">
          Clôture le dernier jour de {MOIS_CLOTURE.find(m => m.value === month)?.label.toLowerCase()}
        </p>
      )}
    </div>
  );
}
