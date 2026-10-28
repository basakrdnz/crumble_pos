import { useState } from 'react';
import { api } from '../api/client';
import type { AuthStatus } from '../api/contract';
import { useAction } from '../components/useApi';

export function Login({ status, onChange }: { status: AuthStatus; onChange(status: AuthStatus): void }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const run = useAction();
  const setup = !status.passwordSet;

  const submit = async () => {
    if (setup && password !== repeat) {
      await run(async () => {
        throw new Error('Şifreler aynı değil.');
      });
      return;
    }
    const next = await run(() => (setup ? api.setupPassword(password) : api.unlock(password)));
    setPassword('');
    setRepeat('');
    if (next) onChange(next);
  };

  return (
    <div className="login">
      <form
        className="panel login-box"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2>Crumble POS</h2>
        {setup ? (
          <p className="muted">İlk kurulum: kasa şifresini belirleyin. Bu şifreyi tüm çalışanlar kullanacak.</p>
        ) : (
          <p className="muted">Devam etmek için kasa şifresini girin.</p>
        )}
        <input
          className="input"
          type="password"
          autoFocus
          placeholder="Şifre"
          aria-label="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {setup && (
          <input
            className="input"
            type="password"
            placeholder="Şifre (tekrar)"
            aria-label="Şifre tekrar"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
        )}
        <button className="btn primary big" disabled={!password}>
          {setup ? 'Şifreyi kaydet' : 'Giriş'}
        </button>
      </form>
    </div>
  );
}
