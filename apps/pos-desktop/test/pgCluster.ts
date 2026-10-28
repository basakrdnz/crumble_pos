// Throwaway local Postgres with the Supabase stub + all migrations, for sync
// integration tests. Skipped when Postgres binaries are not installed.
import { execFileSync, execSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';

const SUPABASE = resolve(__dirname, '../../../supabase');

export function findPgBin(): string | null {
  if (process.env.PG_BIN && existsSync(join(process.env.PG_BIN, 'initdb'))) return process.env.PG_BIN;
  const base = '/usr/lib/postgresql';
  if (!existsSync(base)) return null;
  const versions = readdirSync(base).filter((v) => Number(v) >= 15).sort((a, b) => Number(b) - Number(a));
  for (const v of versions) {
    const bin = join(base, v, 'bin');
    if (existsSync(join(bin, 'initdb'))) return bin;
  }
  return null;
}

export interface PgCluster {
  connect(): Promise<pg.Client>;
  pool(): pg.Pool;
  stop(): void;
}

export async function startCluster(bin: string): Promise<PgCluster> {
  const dir = mkdtempSync(join(tmpdir(), 'crumble-pg-'));
  const asRoot = process.getuid?.() === 0;
  const run = (args: string[]) => {
    if (asRoot) execSync(`su postgres -s /bin/sh -c ${JSON.stringify(args.map((a) => `'${a}'`).join(' '))}`, { stdio: 'pipe' });
    else execFileSync(args[0]!, args.slice(1), { stdio: 'pipe' });
  };
  if (asRoot) {
    chmodSync(dir, 0o777);
    execSync(`chown postgres ${dir}`);
  }
  const port = 55000 + Math.floor(Math.random() * 5000);
  const data = join(dir, 'data');
  run([join(bin, 'initdb'), '-D', data, '-U', 'postgres', '-A', 'trust']);
  run([join(bin, 'pg_ctl'), '-D', data, '-o', `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1`, '-l', join(dir, 'log'), '-w', 'start']);

  const connect = async () => {
    const client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
    await client.connect();
    return client;
  };
  const admin = await connect();
  await admin.query(readFileSync(join(SUPABASE, 'tests/supabase_stub.sql'), 'utf8'));
  for (const file of readdirSync(join(SUPABASE, 'migrations')).sort()) {
    await admin.query(readFileSync(join(SUPABASE, 'migrations', file), 'utf8'));
  }
  await admin.end();

  return {
    connect,
    pool: () => new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', max: 6 }),
    stop: () => {
      try {
        run([join(bin, 'pg_ctl'), '-D', data, '-m', 'immediate', 'stop']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
