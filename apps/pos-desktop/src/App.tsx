import type { Shift } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import type { AuthStatus } from './api/contract';
import { ToastProvider } from './components/Toast';
import { formatTime } from './format';
import { Login } from './screens/Login';
import { Sale } from './screens/Sale';
import { Settings } from './screens/Settings';
import { ShiftScreen } from './screens/Shift';

type Screen = 'sale' | 'shift' | 'settings';

const SCREENS: [Screen, string][] = [
  ['sale', 'Satış'],
  ['shift', 'Vardiya'],
  ['settings', 'Ayarlar'],
];

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [screen, setScreen] = useState<Screen>('sale');
  const [shift, setShift] = useState<Shift | null | undefined>(undefined);

  useEffect(() => {
    void api.authStatus().then(setAuth);
  }, []);

  const reloadShift = useCallback(async () => setShift(await api.getOpenShift()), []);
  useEffect(() => {
    if (auth?.unlocked) void reloadShift();
  }, [auth?.unlocked, reloadShift]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Crumble POS</span>
        {auth?.unlocked &&
          SCREENS.map(([id, label]) => (
            <button key={id} className={`btn${screen === id ? ' active' : ''}`} onClick={() => setScreen(id)}>
              {label}
            </button>
          ))}
        <span className="spacer" />
        {auth?.unlocked && (
          <>
            <span className="status" data-testid="shift-status">
              {shift ? `Vardiya açık · ${formatTime(shift.opened_at)}` : 'Vardiya kapalı'}
            </span>
            <button className="btn" onClick={() => void api.lock().then(setAuth)}>
              Kilitle
            </button>
          </>
        )}
        {/* Read by the smoke test: proves the renderer uses @crumble/shared. */}
        <span data-smoke hidden>
          {formatTL(123450)}
        </span>
      </header>
      <main className="main">
        {!auth ? null : !auth.unlocked ? (
          <Login status={auth} onChange={setAuth} />
        ) : shift === undefined ? null : screen === 'sale' ? (
          <Sale shift={shift} onShiftChange={() => void reloadShift()} />
        ) : screen === 'shift' ? (
          <ShiftScreen shift={shift} onShiftChange={() => void reloadShift()} />
        ) : (
          <Settings />
        )}
      </main>
    </div>
  );
}
