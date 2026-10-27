import { expectedCash, formatTL } from '@crumble/shared';

// Faz 0 placeholder: proves the renderer can use @crumble/shared.
const sample = expectedCash(50000, [{ method: 'cash', amount: 73450 }], []);

export function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
      <h1>Crumble POS</h1>
      <p>Kasa uygulaması iskeleti (Faz 0).</p>
      <p>
        Ortak paket testi: <strong data-smoke>{formatTL(sample)}</strong>
      </p>
    </main>
  );
}
