import { useNavigate } from 'react-router-dom';
import { FileQuestion, ArrowLeft, Home } from 'lucide-react';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-6">
          <FileQuestion className="w-8 h-8 text-slate-400 dark:text-slate-500" />
        </div>

        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">
          Page introuvable
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-8">
          L'adresse que vous avez saisie ne correspond a aucune page existante.
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Home className="w-4 h-4" />
            Tableau de bord
          </button>
        </div>
      </div>
    </div>
  );
}

export default NotFound;
