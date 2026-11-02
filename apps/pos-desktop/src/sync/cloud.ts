// Cloud connection setup (plan §5.6 "Bulut bağlantısı kurulumu", §7): a
// partner enters the Supabase URL, anon key and the device user once. Only the
// URL, key and email are stored; the password is used to sign in and then
// forgotten. The Supabase session is kept in settings, encrypted when the OS
// offers it (Electron safeStorage / Windows DPAPI).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Context } from '../db/database';
import type { SyncService } from './service';
import { restoreFromCloud, type RestoreResult } from './restore';
import { type CloudConfig, createCloudClient, type KeyValueStorage, signInDevice, supabaseTransport } from './supabase';

const CONFIG_KEY = 'cloud_config';
const AUTH_PREFIX = 'supabase_auth:';

export interface SecretBox {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}

export const plainBox: SecretBox = { encrypt: (s) => s, decrypt: (s) => s };

function getSetting(ctx: Context, key: string): string | null {
  return (ctx.db.prepare('select value from settings where key = ?').pluck().get(key) as string | undefined) ?? null;
}

function setSetting(ctx: Context, key: string, value: string | null): void {
  if (value === null) ctx.db.prepare('delete from settings where key = ?').run(key);
  else
    ctx.db
      .prepare('insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value')
      .run(key, value);
}

function settingsStorage(ctx: Context, box: SecretBox): KeyValueStorage {
  return {
    getItem: (key) => {
      const stored = getSetting(ctx, AUTH_PREFIX + key);
      if (stored === null) return null;
      try {
        return box.decrypt(stored);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => setSetting(ctx, AUTH_PREFIX + key, box.encrypt(value)),
    removeItem: (key) => setSetting(ctx, AUTH_PREFIX + key, null),
  };
}

export interface CloudInfo {
  configured: boolean;
  url: string | null;
  email: string | null;
}

export interface ConnectInput extends CloudConfig {
  password: string;
}

export function validateCloudConfig(input: CloudConfig): CloudConfig {
  // Also accept the API address as copied from the dashboard (".../rest/v1/").
  const url = input.url.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    throw new Error('Supabase adresi https://<proje>.supabase.co biçiminde olmalı.');
  }
  if (!input.anonKey.trim()) throw new Error('Publishable (anon) key gerekli.');
  if (!input.email.trim()) throw new Error('Cihaz e-postası gerekli.');
  return { url, anonKey: input.anonKey.trim(), email: input.email.trim() };
}

/** Owns the Supabase client and wires it into the sync service. */
export class CloudManager {
  private client: SupabaseClient | null = null;

  constructor(
    private readonly ctx: Context,
    private readonly sync: SyncService,
    private readonly box: SecretBox = plainBox,
  ) {}

  info(): CloudInfo {
    const config = this.config();
    return { configured: config !== null, url: config?.url ?? null, email: config?.email ?? null };
  }

  private config(): CloudConfig | null {
    const raw = getSetting(this.ctx, CONFIG_KEY);
    return raw ? (JSON.parse(raw) as CloudConfig) : null;
  }

  /** On app start: resume syncing with the stored session, if any. */
  async start(): Promise<void> {
    const config = this.config();
    if (!config) return;
    this.client = createCloudClient(config, settingsStorage(this.ctx, this.box));
    const { data } = await this.client.auth.getSession();
    this.sync.setTransport(data.session ? supabaseTransport(this.client) : null);
  }

  async connect(input: ConnectInput): Promise<CloudInfo> {
    const config = validateCloudConfig(input);
    const client = createCloudClient(config, settingsStorage(this.ctx, this.box));
    await signInDevice(client, config.email, input.password);
    setSetting(this.ctx, CONFIG_KEY, JSON.stringify(config));
    this.client = client;
    this.sync.setTransport(supabaseTransport(client));
    return this.info();
  }

  async disconnect(): Promise<CloudInfo> {
    this.sync.setTransport(null);
    try {
      await this.client?.auth.signOut();
    } catch {
      // Offline: the local session is dropped below anyway.
    }
    this.client = null;
    for (const key of this.ctx.db.prepare('select key from settings where key like ?').pluck().all(`${AUTH_PREFIX}%`) as string[]) {
      setSetting(this.ctx, key, null);
    }
    setSetting(this.ctx, CONFIG_KEY, null);
    return this.info();
  }

  async restore(): Promise<RestoreResult> {
    if (!this.client) throw new Error('Önce bulut bağlantısını kurun.');
    return restoreFromCloud(this.ctx, supabaseTransport(this.client));
  }
}
