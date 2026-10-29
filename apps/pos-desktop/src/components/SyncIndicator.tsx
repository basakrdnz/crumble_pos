import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatTime } from '../format';
import type { SyncStatus } from '../sync/service';

/** Sync state in the left rail (plan Faz 5 "durum göstergesi"). Polls the main process. */
export function SyncIndicator({ onClick }: { onClick(): void }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .getSyncStatus()
        .then((s) => alive && setStatus(s))
        .catch(() => {});
    void tick();
    const id = window.setInterval(tick, 3000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  if (!status) return null;

  const text = {
    disabled: 'Bulut kurulmadı',
    idle: status.pending > 0 ? `${status.pending} bekliyor` : `Senkron ✓${status.lastSyncAt ? ` ${formatTime(status.lastSyncAt)}` : ''}`,
    syncing: 'Senkronlanıyor…',
    offline: `Çevrimdışı · ${status.pending} bekliyor`,
    error: 'Senkron hatası',
  }[status.state];

  return (
    <button
      className={`sync-indicator ${status.state}`}
      title={status.lastError ?? undefined}
      data-testid="sync-status"
      onClick={onClick}
    >
      <span className="dot" />
      <span>{text}</span>
    </button>
  );
}
