// A sync transport that writes straight into Postgres the way PostgREST does
// (json_populate_recordset + ON CONFLICT), as the device user, so RLS and the
// immutability triggers apply exactly as they would on Supabase.
import type pg from 'pg';
import type { SyncedTable } from '../src/db/database';
import {
  type CatalogPuller,
  type CloudReader,
  type DeviceHeartbeat,
  type PushMode,
  SyncError,
  type SyncTransport,
} from '../src/sync/transport';

export const DEVICE_USER = '00000000-0000-0000-0000-00000000d001';
const DEVICE_CLAIMS = JSON.stringify({ sub: DEVICE_USER, role: 'authenticated', app_metadata: { role: 'device' } });

async function asDevice<T>(client: pg.Client, fn: () => Promise<T>): Promise<T> {
  await client.query('begin');
  try {
    await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claims', $1, true)", [DEVICE_CLAIMS]);
    const result = await fn();
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback');
    throw e;
  }
}

async function upsert(client: pg.Client, table: string, rows: Record<string, unknown>[], mode: PushMode) {
  const columns = Object.keys(rows[0]!);
  const conflict =
    mode === 'insert-ignore'
      ? 'do nothing'
      : `do update set ${columns.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ')}`;
  await client.query(
    `insert into public.${table} (${columns.join(', ')})
     select ${columns.join(', ')} from json_populate_recordset(null::public.${table}, $1)
     on conflict (id) ${conflict}`,
    [JSON.stringify(rows)],
  );
}

export function pgTransport(client: pg.Client): SyncTransport & CloudReader & CatalogPuller & { online: boolean } {
  const transport = {
    online: true,
    async pullProducts(since: string) {
      if (!transport.online) throw new SyncError('fetch failed (çevrimdışı)', true);
      return asDevice(client, async () =>
        (await client.query('select * from public.products where updated_at > $1 order by updated_at, id limit 1000', [since])).rows,
      );
    },
    async pullMobileChanges(since: string) {
      if (!transport.online) throw new SyncError('fetch failed (çevrimdışı)', true);
      return asDevice(client, async () =>
        (
          await client.query(
            "select * from public.catalog_changes where source = 'mobile' and created_at > $1 order by created_at, id limit 1000",
            [since],
          )
        ).rows,
      );
    },
    async push(table: SyncedTable, rows: Record<string, unknown>[], mode: PushMode) {
      if (!transport.online) throw new SyncError('fetch failed (çevrimdışı)', true);
      try {
        await asDevice(client, () => upsert(client, table, rows, mode));
      } catch (e) {
        throw new SyncError(e instanceof Error ? e.message : String(e), false);
      }
    },
    async heartbeat(status: DeviceHeartbeat) {
      if (!transport.online) throw new SyncError('fetch failed (çevrimdışı)', true);
      await asDevice(client, () => upsert(client, 'device_status', [{ id: 'pos', ...status }], 'upsert'));
    },
    async readAll(table: SyncedTable) {
      return asDevice(client, async () => (await client.query(`select * from public.${table} order by created_at, id`)).rows);
    },
  };
  return transport;
}
