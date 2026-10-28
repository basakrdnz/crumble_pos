// Renderer-side proxy: api.listProducts() -> IPC -> createApi(...).listProducts().
import type { IpcResult, PosApi } from './contract';

type Async<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never;
};

export const api = new Proxy({} as Async<PosApi>, {
  get: (_target, method: string) => async (...args: unknown[]) => {
    const result = (await window.crumble.invoke(method, args)) as IpcResult;
    if (!result.ok) throw new Error(result.error);
    return result.value;
  },
});
