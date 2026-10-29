// Supabase implementation of the sync transport. The POS signs in as the
// single device user (app_metadata.role = 'device', plan §7); the session is
// kept in the local settings table through `storage`, never the password.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SyncedTable } from '../db/database';
import { type CatalogPuller, type CloudReader, type DeviceHeartbeat, type PushMode, SyncError, type SyncTransport } from './transport';

export interface CloudConfig {
  url: string;
  anonKey: string;
  email: string;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEVICE_STATUS_ID = 'pos';

function asSyncError(error: { message: string; code?: string; status?: number } | null | undefined): SyncError | null {
  if (!error) return null;
  // No HTTP status / fetch failure: we could not reach Supabase.
  const offline = !error.code && !error.status && /fetch|network|ENOTFOUND|ECONN|timeout/i.test(error.message);
  return new SyncError(error.message, offline || (!error.code && !error.status));
}

export function createCloudClient(config: CloudConfig, storage: KeyValueStorage): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

/** Signs in the device user and checks it really is the device role. */
export async function signInDevice(client: SupabaseClient, email: string, password: string): Promise<void> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Giriş başarısız: ${error.message}`);
  if (data.user?.app_metadata?.role !== 'device') {
    await client.auth.signOut();
    throw new Error("Bu kullanıcı cihaz rolünde değil (app_metadata.role = 'device' olmalı).");
  }
}

export function supabaseTransport(client: SupabaseClient): SyncTransport & CloudReader & CatalogPuller {
  const since = async (table: string, column: string, value: string, filter?: [string, string]) => {
    let query = client.from(table).select('*').gt(column, value);
    if (filter) query = query.eq(filter[0], filter[1]);
    const { data, error } = await query.order(column).order('id').limit(1000);
    const syncError = asSyncError(error);
    if (syncError) throw syncError;
    return (data ?? []) as Record<string, unknown>[];
  };
  return {
    pullProducts: (value) => since('products', 'updated_at', value),
    pullMobileChanges: (value) => since('catalog_changes', 'created_at', value, ['source', 'mobile']),
    async push(table: SyncedTable, rows: Record<string, unknown>[], mode: PushMode) {
      let response;
      try {
        response = await client.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: mode === 'insert-ignore' });
      } catch (e) {
        throw new SyncError(e instanceof Error ? e.message : String(e), true);
      }
      const error = asSyncError(response.error ? { ...response.error, status: response.status || undefined } : null);
      if (error) throw error;
    },
    async heartbeat(status: DeviceHeartbeat) {
      const { error } = await client
        .from('device_status')
        .upsert({ id: DEVICE_STATUS_ID, ...status, updated_at: new Date().toISOString() }, { onConflict: 'id' });
      const syncError = asSyncError(error);
      if (syncError) throw syncError;
    },
    async readAll(table: SyncedTable) {
      const rows: Record<string, unknown>[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await client
          .from(table)
          .select('*')
          .order('created_at')
          .order('id')
          .range(from, from + page - 1);
        if (error) throw new Error(`${table} okunamadı: ${error.message}`);
        rows.push(...(data as Record<string, unknown>[]));
        if (!data || data.length < page) break;
      }
      return rows;
    },
  };
}
