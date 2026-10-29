import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api/client';
import { App } from './App';
import '@fontsource-variable/manrope';
import '@fontsource/gloock';
import './styles.css';

// Renderer crashes go to the error log (Ayarlar → Yedek ve günlük).
window.addEventListener('error', (e) => void api.logRendererError(e.message, e.error?.stack).catch(() => {}));
window.addEventListener('unhandledrejection', (e) =>
  void api.logRendererError(String(e.reason?.message ?? e.reason), e.reason?.stack).catch(() => {}),
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
