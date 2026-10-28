import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../components/useApi';

export function Password() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const run = useAction();
  return (
    <>
      <h2>Kasa şifresi</h2>
      <form
        className="panel form"
        style={{ maxWidth: 480 }}
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            if (next !== repeat) throw new Error('Yeni şifreler aynı değil.');
            await api.changePassword(current, next);
            setCurrent('');
            setNext('');
            setRepeat('');
          }, 'Şifre değiştirildi.');
        }}
      >
        <label htmlFor="pw-current">Mevcut şifre</label>
        <input id="pw-current" className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <label htmlFor="pw-next">Yeni şifre</label>
        <input id="pw-next" className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        <label htmlFor="pw-repeat">Yeni şifre (tekrar)</label>
        <input id="pw-repeat" className="input" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        <span />
        <button className="btn primary" disabled={!current || !next}>
          Değiştir
        </button>
      </form>
    </>
  );
}
