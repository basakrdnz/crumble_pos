import { useState } from 'react';
import { api } from '../api/client';
import type { AuthStatus } from '../api/contract';
import { Keypad } from '../components/Keypad';
import { useAction } from '../components/useApi';

const hourFormat = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: 'numeric', hourCycle: 'h23' });

/** "Günaydın." in the morning, otherwise a fitting greeting (Istanbul time). */
function greeting(now = new Date()): string {
  const hour = Number(hourFormat.format(now));
  if (hour >= 5 && hour < 12) return 'Günaydın.';
  if (hour >= 12 && hour < 18) return 'İyi günler.';
  return 'İyi akşamlar.';
}

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
      <section className="login-hero">
        <div className="brand">CRUMBLE</div>
        <div>
          <h1>{setup ? 'Hoş geldin.' : greeting()}</h1>
          <p>
            {setup
              ? 'İlk kurulum: kasa şifresini belirle. Bu şifreyi tüm çalışanlar kullanacak.'
              : 'Kasa kilitli. Devam etmek için kasa şifresini gir.'}
          </p>
        </div>
        <small>Crumble Cafe · Çankaya</small>
      </section>
      <div className="login-side">
        <form
          className="login-box"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h2>{setup ? 'Kasa şifresini belirle' : 'Kasa şifresi'}</h2>
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
          {!setup && <Keypad value={password} onChange={setPassword} maxLength={32} captureKeyboard={false} />}
          <button className="btn primary big" disabled={!password}>
            {setup ? 'Şifreyi kaydet' : 'Giriş'}
          </button>
        </form>
      </div>
    </div>
  );
}
