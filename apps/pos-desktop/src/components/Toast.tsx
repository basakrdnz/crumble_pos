import { createContext, type ReactNode, useCallback, useContext, useState } from 'react';

interface ToastState {
  kind: 'error' | 'info';
  message: string;
}

const ToastContext = createContext<{ error(e: unknown): void; info(message: string): void }>({
  error: () => {},
  info: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = useCallback((next: ToastState) => {
    setToast(next);
    window.setTimeout(() => setToast((t) => (t === next ? null : t)), next.kind === 'error' ? 6000 : 3000);
  }, []);
  const error = useCallback(
    (e: unknown) => show({ kind: 'error', message: e instanceof Error ? e.message : String(e) }),
    [show],
  );
  const info = useCallback((message: string) => show({ kind: 'info', message }), [show]);
  return (
    <ToastContext.Provider value={{ error, info }}>
      {children}
      {toast && (
        <div className={`toast ${toast.kind}`} role="alert" onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
