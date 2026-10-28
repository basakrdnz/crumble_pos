import type { Shift } from '@crumble/shared';
import { formatTL } from '@crumble/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import type { AuthStatus } from './api/contract';
import { SyncIndicator } from './components/SyncIndicator';
import { ToastProvider } from './components/Toast';
import { formatTime } from './format';
import { FloorPlan } from './screens/FloorPlan';
import { Login } from './screens/Login';
import { Sale } from './screens/Sale';
import { Sales } from './screens/Sales';
import { Settings, type SettingsSection } from './screens/Settings';
import { ShiftScreen } from './screens/Shift';
import { Tabs } from './screens/Tabs';

type Screen = 'sale' | 'floor' | 'tabs' | 'sales' | 'shift' | 'settings';

const SCREENS: [Screen, string][] = [
  ['sale', 'Satış'],
  ['floor', 'Kroki'],
  ['tabs', 'Hesaplar'],
  ['sales', 'Satışlar'],
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
  const [newTabRequest, setNewTabRequest] = useState(0);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('catalog');

  useEffect(() => {
    void api.authStatus().then(setAuth);
  }, []);

  const reloadShift = useCallback(async () => setShift(await api.getOpenShift()), []);
  useEffect(() => {
    if (auth?.unlocked) void reloadShift();
  }, [auth?.unlocked, reloadShift]);

  // F3: new named tab (plan §5.1), from anywhere.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'F3' || !auth?.unlocked || !shift) return;
      e.preventDefault();
      setScreen('tabs');
      setNewTabRequest((n) => n + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [auth?.unlocked, shift]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Crumble POS</span>
        {auth?.unlocked &&
          SCREENS.map(([id, label]) => (
            <button
              key={id}
              className={`btn${screen === id ? ' active' : ''}`}
              onClick={() => {
                if (id === 'settings') setSettingsSection('catalog');
                setScreen(id);
              }}
            >
              {label}
            </button>
          ))}
        <span className="spacer" />
        {auth?.unlocked && (
          <>
            <SyncIndicator
              onClick={() => {
                setSettingsSection('cloud');
                setScreen('settings');
              }}
            />
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
        ) : (screen === 'floor' || screen === 'tabs') && !shift ? (
          <Sale shift={null} onShiftChange={() => void reloadShift()} />
        ) : screen === 'floor' ? (
          <FloorPlan />
        ) : screen === 'tabs' ? (
          <Tabs newTabRequest={newTabRequest} />
        ) : screen === 'sales' ? (
          <Sales shift={shift} />
        ) : screen === 'shift' ? (
          <ShiftScreen shift={shift} onShiftChange={() => void reloadShift()} />
        ) : (
          <Settings key={settingsSection} initial={settingsSection} />
        )}
      </main>
    </div>
  );
}
