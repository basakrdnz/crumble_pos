import { formatTL } from '@crumble/shared';
import { useState } from 'react';
import { ToastProvider } from './components/Toast';
import { Settings } from './screens/Settings';

type Screen = 'sale' | 'settings';

export function App() {
  const [screen, setScreen] = useState<Screen>('settings');
  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <span className="brand">Crumble POS</span>
          <button className={`btn${screen === 'sale' ? ' active' : ''}`} onClick={() => setScreen('sale')}>
            Satış
          </button>
          <button className={`btn${screen === 'settings' ? ' active' : ''}`} onClick={() => setScreen('settings')}>
            Ayarlar
          </button>
          <span className="spacer" />
          {/* Read by the smoke test: proves the renderer uses @crumble/shared. */}
          <span data-smoke hidden>
            {formatTL(123450)}
          </span>
        </header>
        <main className="main">
          {screen === 'settings' ? <Settings /> : <div className="content empty">Satış ekranı Faz 2'de gelecek.</div>}
        </main>
      </div>
    </ToastProvider>
  );
}
