// A tiny stand-in for Supabase in front of a real Postgres with our
// migrations, for end-to-end tests:
// - Auth: password sign-in for the device user and a partner user.
// - PostgREST: POST upserts (the POS sync) and a GET subset (the manager app:
//   select, eq/neq/gt/gte/lt/lte/in/is filters, order, limit/offset), and
//   POST /rpc/<fn> for the menu functions (telefondan menü).
// Every query runs as the signed-in user (role authenticated + JWT claims),
// so RLS and the immutability triggers apply. stop() simulates the internet
// going away. Realtime is not emulated: the manager app falls back to polling.
import { createServer, type Server } from 'node:http';
import type pg from 'pg';
import type { SyncedTable } from '../src/db/database';
import { DEVICE_USER, pgTransport } from '../test/pgTransport';

export const PARTNER_USER = '00000000-0000-0000-0000-00000000a001';

export interface FakeSupabase {
  url: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface Claims {
  sub: string;
  role: 'authenticated';
  email: string;
  app_metadata: Record<string, unknown>;
}

const b64url = (s: string) => Buffer.from(s).toString('base64url');
const jwt = (claims: object) => `${b64url('{"alg":"none","typ":"JWT"}')}.${b64url(JSON.stringify(claims))}.x`;
const claimsOf = (header: string | undefined): Claims | null => {
  const token = header?.replace(/^Bearer /, '');
  try {
    return JSON.parse(Buffer.from(token!.split('.')[1]!, 'base64url').toString()) as Claims;
  } catch {
    return null;
  }
};

const IDENT = /^[a-z_][a-z0-9_]*$/;
const READABLE = new Set([
  'categories', 'products', 'floor_plans', 'tables', 'shifts', 'tabs', 'tab_items', 'payments', 'refunds',
  'catalog_changes', 'partners', 'device_status',
]);
const RPCS = new Set(['menu_set_price', 'menu_add_product', 'menu_delete_product']);
const OPS: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };

function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`bad identifier ${name}`);
  return name;
}

/** Builds a parameterised SELECT from PostgREST query params. */
function buildSelect(table: string, params: URLSearchParams): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const select = params.get('select') ?? '*';
  const columns = select === '*' ? '*' : select.split(',').map((c) => ident(c.trim())).join(', ');
  const where: string[] = [];
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    const column = ident(key);
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot);
    const value = raw.slice(dot + 1);
    if (OPS[op]) {
      values.push(value);
      where.push(`${column} ${OPS[op]} $${values.length}`);
    } else if (op === 'in') {
      const list = value.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''));
      values.push(list);
      where.push(`${column}::text = any($${values.length})`);
    } else if (op === 'is') {
      if (!['null', 'true', 'false'].includes(value)) throw new Error(`bad is.${value}`);
      where.push(`${column} is ${value}`);
    } else {
      throw new Error(`unsupported filter ${key}=${raw}`);
    }
  }
  const order = (params.get('order') ?? '')
    .split(',')
    .filter(Boolean)
    .map((part) => {
      const [col, dir = 'asc'] = part.split('.');
      return `${ident(col!)} ${dir === 'desc' ? 'desc' : 'asc'}`;
    });
  let sql = `select ${columns} from public.${ident(table)}`;
  if (where.length) sql += ` where ${where.join(' and ')}`;
  if (order.length) sql += ` order by ${order.join(', ')}`;
  const limit = Number(params.get('limit'));
  const offset = Number(params.get('offset'));
  if (Number.isInteger(limit) && limit > 0) sql += ` limit ${limit}`;
  if (Number.isInteger(offset) && offset > 0) sql += ` offset ${offset}`;
  return { sql, values };
}

export function fakeSupabase(pool: pg.Pool, port: number, users: { device: string; partner: string }): FakeSupabase {
  let server: Server | null = null;

  const handler: Parameters<typeof createServer>[1] = (req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      void (async () => {
        const url = new URL(req.url!, 'http://x');
        res.setHeader('access-control-allow-origin', '*');
        res.setHeader('access-control-allow-headers', '*');
        res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        const send = (status: number, json?: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(json === undefined ? '' : JSON.stringify(json));
        };
        if (req.method === 'OPTIONS') return send(204);

        if (url.pathname === '/auth/v1/token') {
          const { email } = JSON.parse(body) as { email: string };
          const id = email === users.device ? DEVICE_USER : email === users.partner ? PARTNER_USER : null;
          if (!id) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials' });
          const app_metadata = id === DEVICE_USER ? { role: 'device' } : {};
          const exp = Math.floor(Date.now() / 1000) + 3600;
          const claims = { sub: id, role: 'authenticated', aud: 'authenticated', email, app_metadata, exp };
          const user = { id, aud: 'authenticated', role: 'authenticated', email, app_metadata, user_metadata: {} };
          return send(200, { access_token: jwt(claims), refresh_token: `r-${id}`, token_type: 'bearer', expires_in: 3600, expires_at: exp, user });
        }
        if (url.pathname === '/auth/v1/logout') return send(204);
        if (url.pathname === '/auth/v1/user') {
          const claims = claimsOf(req.headers.authorization);
          return claims ? send(200, { id: claims.sub, email: claims.email, app_metadata: claims.app_metadata, aud: 'authenticated', role: 'authenticated' }) : send(401, { message: 'no session' });
        }

        const rest = /^\/rest\/v1\/(rpc\/)?(\w+)$/.exec(url.pathname);
        if (!rest) return send(404, { message: `not found: ${req.method} ${url.pathname}` });
        const table = rest[2]!;
        const claims = claimsOf(req.headers.authorization);
        if (!claims) return send(401, { message: 'JWT required', code: 'PGRST301' });

        const client = await pool.connect();
        try {
          if (rest[1]) {
            if (req.method !== 'POST' || !RPCS.has(table)) return send(404, { message: 'unknown function' });
            const args = JSON.parse(body || '{}') as Record<string, unknown>;
            const names = Object.keys(args).map(ident);
            const sql = `select public.${table}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')})`;
            await client.query('begin');
            try {
              await client.query('set local role authenticated');
              await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
              await client.query(sql, Object.values(args));
              await client.query('commit');
              return send(204);
            } catch (e) {
              await client.query('rollback');
              throw e;
            }
          }
          if (req.method === 'POST') {
            if (claims.sub !== DEVICE_USER) return send(403, { message: 'permission denied', code: '42501' });
            const transport = pgTransport(client);
            const rows = JSON.parse(body) as Record<string, unknown> | Record<string, unknown>[];
            const list = Array.isArray(rows) ? rows : [rows];
            const ignore = /ignore-duplicates/.test(String(req.headers.prefer));
            if (table === 'device_status') await transport.heartbeat(list[0] as never);
            else await transport.push(table as SyncedTable, list, ignore ? 'insert-ignore' : 'upsert');
            return send(201);
          }
          if (req.method === 'GET') {
            if (!READABLE.has(table)) return send(404, { message: 'unknown table' });
            const { sql, values } = buildSelect(table, url.searchParams);
            await client.query('begin');
            try {
              await client.query('set local role authenticated');
              await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
              const result = await client.query(sql, values);
              await client.query('commit');
              return send(200, result.rows);
            } catch (e) {
              await client.query('rollback');
              throw e;
            }
          }
          return send(405, { message: 'method not allowed' });
        } catch (e) {
          return send(400, { message: e instanceof Error ? e.message : String(e), code: 'P0001', details: null, hint: null });
        } finally {
          client.release();
        }
      })();
    });
  };

  return {
    url: `http://127.0.0.1:${port}`,
    start: () =>
      new Promise((resolve) => {
        server = createServer(handler);
        server.listen(port, '127.0.0.1', () => resolve());
      }),
    stop: () =>
      new Promise((resolve) => {
        if (!server) return resolve();
        server.closeAllConnections();
        server.close(() => resolve());
        server = null;
      }),
  };
}
