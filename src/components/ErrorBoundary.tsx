import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

const RELOAD_KEY = 'chunk-reload-attempted';

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes("'text/html' is not a valid javascript mime type")
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (isChunkLoadError(error)) {
      const lastReload = sessionStorage.getItem(RELOAD_KEY);
      const reloadedRecently = lastReload && Date.now() - Number(lastReload) < 30_000;
      if (!reloadedRecently) {
        sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
        window.location.reload();
        return;
      }
    }
    console.error('[ErrorBoundary]', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
          <div className="text-center max-w-md">
            <div className="mx-auto w-16 h-16 bg-red-100 dark:bg-red-950/40 rounded-full flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Une erreur est survenue
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              L'application a rencontre un probleme inattendu. Veuillez rafraichir la page.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.href = '/';
              }}
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg transition-colors"
            >
              Retour a l'accueil
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
