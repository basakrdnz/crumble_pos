// Hook points for things that react to sales (receipt printer, cash drawer;
// out of MVP scope, plan §11). Listeners run after the sale is committed and
// must not throw back into the sale.

export interface SaleCompleted {
  tabId: string;
  total: number;
}

type Listener = (event: SaleCompleted) => void;

const listeners = new Set<Listener>();

export function onSaleCompleted(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSaleCompleted(event: SaleCompleted): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error('onSaleCompleted listener failed', error);
    }
  }
}
