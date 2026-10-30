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

// Left rail (plan "Tasarım yenileme": N2). Icons are 24×24 stroke paths.
const SCREENS: [Screen, string, string][] = [
  ['sale', 'Satış', 'M6 7h12l-1 13H7L6 7zM9 7a3 3 0 0 1 6 0'],
  ['floor', 'Kroki', 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
  ['tabs', 'Hesaplar', 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6'],
  ['sales', 'Satışlar', 'M5 6h14M5 12h14M5 18h14'],
  ['shift', 'Vardiya', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2'],
  ['settings', 'Ayarlar', 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6'],
];

function Icon({ path, size = 22 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

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
      {auth?.unlocked && (
        <nav className="rail" aria-label="Ana menü">
          <div className="rail-logo">CRUMBLE</div>
          {SCREENS.map(([id, label, icon]) => (
            <button
              key={id}
              className={`rail-item${screen === id ? ' active' : ''}`}
              aria-current={screen === id ? 'page' : undefined}
              onClick={() => {
                if (id === 'settings') setSettingsSection('catalog');
                setScreen(id);
              }}
            >
              <Icon path={icon} />
              <span>{label}</span>
            </button>
          ))}
          <div className="rail-spacer" />
          <SyncIndicator
            onClick={() => {
              setSettingsSection('cloud');
              setScreen('settings');
            }}
          />
          <div className="rail-info" data-testid="shift-status">
            {shift ? (
              <>
                Vardiya açık <br />
                {formatTime(shift.opened_at)}
              </>
            ) : (
              <>
                Vardiya <br />
                kapalı
              </>
            )}
          </div>
          <button className="rail-lock" aria-label="Kilitle" title="Kilitle" onClick={() => void api.lock().then(setAuth)}>
            <Icon path="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" size={20} />
          </button>
        </nav>
      )}
      {/* Read by the smoke test: proves the renderer uses @crumble/shared. */}
      <span data-smoke hidden>
        {formatTL(123450)}
      </span>
      <main className="main">
        {!auth ? null : !auth.unlocked ? (
          <Login onChange={setAuth} />
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
