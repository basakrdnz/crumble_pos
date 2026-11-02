/// <reference types="vite/client" />
interface Window {
  crumble: {
    versions: { electron: string; node: string };
    invoke(method: string, args: unknown[]): Promise<unknown>;
    /** Subscribes to screen requests from the main process; returns the unsubscribe. */
    onNavigate?(listener: (screen: string) => void): () => void;
  };
}
