import { describe, expect, it } from 'vitest';
import { createApi, dispatch } from '../src/api/server';
import { testContext } from './helpers';

describe('API lock', () => {
  it('refuses everything but login while locked', async () => {
    const server = createApi(testContext());
    expect(await dispatch(server, 'listProducts', [])).toEqual({ ok: false, error: 'Kasa kilitli. Şifre ile giriş yapın.' });
    expect(await dispatch(server, 'authStatus', [])).toEqual({ ok: true, value: { passwordSet: false, unlocked: false } });
    expect(await dispatch(server, 'setupPassword', ['1234'])).toMatchObject({ ok: true, value: { unlocked: true } });
    expect(await dispatch(server, 'listProducts', [])).toEqual({ ok: true, value: [] });
    await dispatch(server, 'lock', []);
    expect(await dispatch(server, 'unlock', ['yanlis'])).toEqual({ ok: false, error: 'Şifre yanlış.' });
    expect(await dispatch(server, 'unlock', ['1234'])).toMatchObject({ ok: true });
  });

  it('returns errors as messages and rejects unknown methods', async () => {
    const server = createApi(testContext());
    await dispatch(server, 'setupPassword', ['1234']);
    expect(await dispatch(server, 'openShift', [-1])).toEqual({ ok: false, error: 'Açılış kasası negatif olamaz.' });
    expect(await dispatch(server, 'dropDatabase', [])).toMatchObject({ ok: false });
  });
});

describe('sync nudge', () => {
  it('nudges after writes only', async () => {
    let writes = 0;
    const base = createApi(testContext());
    const server = { ...base, onWrite: () => writes++ };
    await dispatch(server, 'setupPassword', ['1234']);
    await dispatch(server, 'listProducts', []);
    await dispatch(server, 'getOpenShift', []);
    expect(writes).toBe(1);
    await dispatch(server, 'createCategory', ['Kahve']);
    expect(writes).toBe(2);
    await dispatch(server, 'createCategory', ['']); // failed write: no nudge
    expect(writes).toBe(2);
  });
});
