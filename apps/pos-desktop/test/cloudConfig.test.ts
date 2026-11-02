import { describe, expect, it } from 'vitest';
import { validateCloudConfig } from '../src/sync/cloud';

describe('cloud settings', () => {
  const base = { anonKey: ' sb_publishable_x ', email: 'kasa@crumble.local' };

  it('accepts the project address, also as copied from the dashboard (.../rest/v1/)', () => {
    for (const url of ['https://abc.supabase.co', 'https://abc.supabase.co/', ' https://abc.supabase.co/rest/v1/ ']) {
      expect(validateCloudConfig({ ...base, url })).toEqual({ url: 'https://abc.supabase.co', anonKey: 'sb_publishable_x', email: 'kasa@crumble.local' });
    }
  });

  it('rejects other addresses and an empty key', () => {
    expect(() => validateCloudConfig({ ...base, url: 'http://abc.supabase.co' })).toThrow('https://');
    expect(() => validateCloudConfig({ ...base, url: 'https://abc.supabase.co/auth/v1' })).toThrow('https://');
    expect(() => validateCloudConfig({ ...base, url: 'https://abc.supabase.co', anonKey: ' ' })).toThrow('key gerekli');
  });
});
