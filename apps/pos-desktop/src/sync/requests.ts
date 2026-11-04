// Açık hesap istekleri telefondan (2026-11-04, supabase migration 0012): the
// phone leaves a request (payment, rename, cancel), the POS applies it with
// its own rules and reports the result. Applying twice is harmless: the
// payment takes the request's id, a rename to the same name and a cancel of a
// cancelled tab change nothing.
import type { Context } from '../db/database';
import { pay, setCustomerName, voidTab } from '../db/sales';

export interface TabRequest {
  id: string;
  tab_id: string;
  kind: 'pay' | 'rename' | 'void';
  amount: number | null;
  method: 'cash' | 'card' | null;
  customer_name: string | null;
  created_at: string;
}

export interface TabRequestChannel {
  /** Pending requests, oldest first. */
  pendingTabRequests(): Promise<TabRequest[]>;
  reportTabRequest(id: string, ok: boolean, error?: string): Promise<void>;
}

export type RequestOutcome = { id: string; ok: true } | { id: string; ok: false; error: string };

function tabStatus(ctx: Context, tabId: string): string | undefined {
  return ctx.db.prepare('select status from tabs where id = ?').pluck().get(tabId) as string | undefined;
}

export function applyTabRequest(ctx: Context, request: TabRequest): RequestOutcome {
  try {
    if (request.kind === 'pay') {
      const done = ctx.db.prepare('select 1 from payments where id = ?').pluck().get(request.id);
      if (!done) pay(ctx, request.tab_id, [{ id: request.id, method: request.method!, amount: request.amount! }]);
    } else if (request.kind === 'rename') {
      const name = ctx.db.prepare('select customer_name from tabs where id = ?').pluck().get(request.tab_id);
      if (name !== request.customer_name) setCustomerName(ctx, request.tab_id, request.customer_name);
    } else if (tabStatus(ctx, request.tab_id) !== 'void') {
      voidTab(ctx, request.tab_id);
    }
    return { id: request.id, ok: true };
  } catch (e) {
    return { id: request.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Fetches and applies the pending requests; returns what happened (to report after the push). */
export async function applyPendingRequests(ctx: Context, channel: TabRequestChannel): Promise<RequestOutcome[]> {
  const requests = await channel.pendingTabRequests();
  return requests.map((r) => applyTabRequest(ctx, r));
}
