// A tiny stand-in for Supabase (Auth + PostgREST upsert) in front of a real
// Postgres with our migrations. Writes go through pgTransport as the device
// user, so RLS and triggers apply. stop() simulates the internet going away.
import { createServer, type Server } from 'node:http';
import type pg from 'pg';
import type { SyncedTable } from '../src/db/database';
import { DEVICE_USER, pgTransport } from '../test/pgTransport';

export interface FakeSupabase {
  url: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function fakeSupabase(db: pg.Client, port: number): FakeSupabase {
  const transport = pgTransport(db);
  let server: Server | null = null;

  const handler: Parameters<typeof createServer>[1] = (req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const url = new URL(req.url!, 'http://x');
      const send = (status: number, json?: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(json === undefined ? '' : JSON.stringify(json));
      };
      if (url.pathname === '/auth/v1/token') {
        const { email } = JSON.parse(body) as { email: string };
        const user = { id: DEVICE_USER, aud: 'authenticated', role: 'authenticated', email, app_metadata: { role: 'device' }, user_metadata: {} };
        return send(200, {
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        });
      }
      if (url.pathname === '/auth/v1/logout') return send(204);
      const rest = /^\/rest\/v1\/(\w+)$/.exec(url.pathname);
      if (rest && req.method === 'POST') {
        const table = rest[1] as SyncedTable | 'device_status';
        const rows = JSON.parse(body) as Record<string, unknown> | Record<string, unknown>[];
        const list = Array.isArray(rows) ? rows : [rows];
        const ignore = /ignore-duplicates/.test(String(req.headers.prefer));
        const write =
          table === 'device_status'
            ? transport.heartbeat(list[0] as never)
            : transport.push(table, list, ignore ? 'insert-ignore' : 'upsert');
        write.then(
          () => send(201),
          (e: Error) => send(400, { message: e.message, code: 'P0001', details: null, hint: null }),
        );
        return;
      }
      send(404, { message: `not found: ${req.method} ${url.pathname}` });
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
