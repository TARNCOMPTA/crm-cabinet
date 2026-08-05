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
import { InputHTMLAttributes, forwardRef, ReactNode, useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, helperText, className = '', ...props }, ref) => {
    const idAuto = useId();
    const id = props.id ?? idAuto;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
              {icon}
            </div>
          )}
          <input
            id={id}
            ref={ref}
            className={`w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 dark:focus:ring-cyan-400/30 dark:focus:border-cyan-400/40 bg-white dark:bg-white/[0.04] text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 transition-all duration-200 ${
              error ? 'border-red-500 dark:border-red-400/60' : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'
            } ${icon ? 'pl-10' : ''} ${className}`}
            {...props}
          />
        </div>
        {helperText && !error && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{helperText}</p>
        )}
        {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
