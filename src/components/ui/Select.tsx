/**
 * Le libelle est LIE au champ, par `htmlFor`/`id`.
 *
 * Il ne l'etait pas : le `<label>` flottait a cote d'un `<input>` sans `id`, ce
 * qui les rend etrangers l'un a l'autre pour tout ce qui lit la page autrement
 * qu'avec les yeux. Un lecteur d'ecran annonce alors un champ sans nom, et
 * cliquer le libelle ne place pas le curseur dans la case — deux gestes que
 * l'on tient pour acquis.
 *
 * Le defaut valait pour les trois composants de formulaire, donc pour les 255
 * `<Input>` et 101 `<Select>` de l'application. Il a ete trouve en pilotant
 * l'application dans un navigateur : Playwright cherche les champs par leur
 * nom accessible, exactement comme une aide technique, et n'en trouvait aucun.
 *
 * `useId` fournit un identifiant stable entre le rendu serveur et le rendu
 * client. Un `id` passe par l'appelant reste prioritaire.
 */
import { SelectHTMLAttributes, forwardRef, ReactNode, useId } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: Array<{ value: string; label: string }>;
  children?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, children, className = '', ...props }, ref) => {
    const idAuto = useId();
    const id = props.id ?? idAuto;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <select
          id={id}
          ref={ref}
          className={`w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 dark:focus:ring-cyan-400/30 dark:focus:border-cyan-400/40 bg-white dark:bg-white/[0.04] text-gray-900 dark:text-slate-100 transition-all duration-200 ${
            error ? 'border-red-500' : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
          } ${className}`}
          {...props}
        >
          {options ? (
            options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          ) : (
            children
          )}
        </select>
        {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
