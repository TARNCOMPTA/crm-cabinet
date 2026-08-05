import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'progress';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  progress?: { current: number; total: number };
  sticky?: boolean;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: Exclude<ToastType, 'progress'>) => void;
  removeToast: (id: string) => void;
  startProgress: (message: string, total: number) => string;
  updateProgress: (id: string, current: number, total?: number) => void;
  finishProgress: (
    id: string,
    finalMessage: string,
    finalType?: Exclude<ToastType, 'progress'>
  ) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: Exclude<ToastType, 'progress'> = 'info') => {
      const id = generateId();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    },
    []
  );

  const startProgress = useCallback((message: string, total: number) => {
    const id = generateId();
    setToasts((prev) => [
      ...prev,
      {
        id,
        message,
        type: 'progress',
        progress: { current: 0, total },
        sticky: true,
      },
    ]);
    return id;
  }, []);

  const updateProgress = useCallback((id: string, current: number, total?: number) => {
    setToasts((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              progress: {
                current,
                total: total ?? t.progress?.total ?? current,
              },
            }
          : t
      )
    );
  }, []);

  const finishProgress = useCallback(
    (id: string, finalMessage: string, finalType: Exclude<ToastType, 'progress'> = 'success') => {
      setToasts((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, message: finalMessage, type: finalType, sticky: false, progress: undefined }
            : t
        )
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        removeToast,
        startProgress,
        updateProgress,
        finishProgress,
      }}
    >
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
