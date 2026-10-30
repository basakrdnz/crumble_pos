import { describe, expect, it } from 'vitest';
import { createApi, dispatch } from '../src/api/server';
import { testContext } from './helpers';

describe('API lock', () => {
  it('refuses everything but login while locked', async () => {
    const server = createApi(testContext());
    expect(await dispatch(server, 'listProducts', [])).toEqual({ ok: false, error: 'Kasa kilitli. Şifre ile giriş yapın.' });
    expect(await dispatch(server, 'authStatus', [])).toEqual({ ok: true, value: { unlocked: false } });
    expect(await dispatch(server, 'unlock', ['1010'])).toMatchObject({ ok: true, value: { unlocked: true } }); // default password
    expect(await dispatch(server, 'listProducts', [])).toEqual({ ok: true, value: [] });
    await dispatch(server, 'lock', []);
    expect(await dispatch(server, 'unlock', ['yanlis'])).toEqual({ ok: false, error: 'Şifre yanlış.' });
    expect(await dispatch(server, 'unlock', ['1010'])).toMatchObject({ ok: true });
    await dispatch(server, 'changePassword', ['1010', '2468']);
    await dispatch(server, 'lock', []);
    expect(await dispatch(server, 'unlock', ['1010'])).toEqual({ ok: false, error: 'Şifre yanlış.' });
    expect(await dispatch(server, 'unlock', ['2468'])).toMatchObject({ ok: true });
  });

  it('returns errors as messages and rejects unknown methods', async () => {
    const server = createApi(testContext());
    await dispatch(server, 'unlock', ['1010']);
    expect(await dispatch(server, 'openTab', [{ kind: 'quick' }])).toEqual({ ok: false, error: 'Açık vardiya yok. Önce vardiyayı açın.' });
    expect(await dispatch(server, 'dropDatabase', [])).toMatchObject({ ok: false });
  });
});

describe('sync nudge', () => {
  it('nudges after writes only', async () => {
    let writes = 0;
    const base = createApi(testContext());
    const server = { ...base, onWrite: () => writes++ };
    await dispatch(server, 'unlock', ['1010']);
    await dispatch(server, 'listProducts', []);
    await dispatch(server, 'getOpenShift', []);
    expect(writes).toBe(1);
    await dispatch(server, 'createCategory', ['Kahve']);
    expect(writes).toBe(2);
    await dispatch(server, 'createCategory', ['']); // failed write: no nudge
    expect(writes).toBe(2);
  });
});

describe('error logging', () => {
  it('logs unexpected errors but not messages meant for the cashier', async () => {
    const lines: string[] = [];
    const logger = { dir: '', log: (level: string, message: string) => lines.push(`${level} ${message}`), recent: () => [] };
    const ctx = testContext();
    const server = createApi(ctx, undefined, { backupDir: '', logger, openPath: () => {} });
    await dispatch(server, 'unlock', ['1010']);
    await dispatch(server, 'openTab', [{ kind: 'quick' }]); // validation message: not logged
    ctx.db.exec('drop table shifts'); // something truly broken
    await dispatch(server, 'getOpenShift', []);
    expect(lines).toEqual(['error İşlem başarısız: getOpenShift']);
    await dispatch(server, 'lock', []);
    expect(await dispatch(server, 'logRendererError', ['x is undefined'])).toMatchObject({ ok: true });
    expect(lines.at(-1)).toBe('error Ekran hatası: x is undefined');
  });
});
