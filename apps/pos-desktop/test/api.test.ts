import { describe, expect, it } from 'vitest';
import { createApi, dispatch } from '../src/api/server';
import { testContext } from './helpers';

describe('API lock', () => {
  it('refuses everything but login while locked', () => {
    const server = createApi(testContext());
    expect(dispatch(server, 'listProducts', [])).toEqual({ ok: false, error: 'Kasa kilitli. Şifre ile giriş yapın.' });
    expect(dispatch(server, 'authStatus', [])).toEqual({ ok: true, value: { passwordSet: false, unlocked: false } });
    expect(dispatch(server, 'setupPassword', ['1234'])).toMatchObject({ ok: true, value: { unlocked: true } });
    expect(dispatch(server, 'listProducts', [])).toEqual({ ok: true, value: [] });
    dispatch(server, 'lock', []);
    expect(dispatch(server, 'unlock', ['yanlis'])).toEqual({ ok: false, error: 'Şifre yanlış.' });
    expect(dispatch(server, 'unlock', ['1234'])).toMatchObject({ ok: true });
  });

  it('returns errors as messages and rejects unknown methods', () => {
    const server = createApi(testContext());
    dispatch(server, 'setupPassword', ['1234']);
    expect(dispatch(server, 'openShift', [-1])).toEqual({ ok: false, error: 'Açılış kasası negatif olamaz.' });
    expect(dispatch(server, 'dropDatabase', [])).toMatchObject({ ok: false });
  });
});
