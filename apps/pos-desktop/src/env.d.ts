/// <reference types="vite/client" />
interface Window {
  crumble: {
    versions: { electron: string; node: string };
    invoke(method: string, args: unknown[]): Promise<unknown>;
  };
}
