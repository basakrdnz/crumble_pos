import { useState } from 'react';
import { api } from '../../api/client';
import { useAction, useApiData } from '../../components/useApi';
import { formatDateTime } from '../../format';

const STATE: Record<string, string> = {
  disabled: 'Kapalı',
  idle: 'Çalışıyor',
  syncing: 'Senkronlanıyor',
  offline: 'Çevrimdışı (internet gelince devam eder)',
  error: 'Hata: bulut bir kaydı reddetti',
};

/** Cloud connection setup (plan §5.6 / §7). Filled in once by a partner. */
export function Cloud() {
  const [info, reloadInfo] = useApiData(() => api.getCloudInfo());
  const [status, reloadStatus] = useApiData(() => api.getSyncStatus());
  const [empty, reloadEmpty] = useApiData(() => api.isLocalEmpty());
  const [form, setForm] = useState({ url: '', anonKey: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const run = useAction();

  const reload = async () => {
    await reloadInfo();
    await reloadStatus();
    await reloadEmpty();
  };
  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    await run(async () => {
      await fn();
      await reload();
    }, success);
    setBusy(false);
  };

  if (!info || !status) return null;

  return (
    <>
      <h2>Bulut bağlantısı</h2>
      <p className="muted" style={{ maxWidth: 640 }}>
        Kasa her işlemi önce bu bilgisayara kaydeder, sonra internet varken buluta (Supabase) gönderir. İnternet yokken satış
        yapmaya devam edebilirsiniz. Bu bilgileri kurulumda bir ortak girer. Cihaz şifresi saklanmaz.
      </p>
      {info.configured ? (
        <div className="panel form" style={{ maxWidth: 640 }}>
          <label>Adres</label>
          <span>{info.url}</span>
          <label>Cihaz kullanıcısı</label>
          <span>{info.email}</span>
          <label>Durum</label>
          <span data-testid="cloud-state">{STATE[status.state]}</span>
          <label>Bekleyen kayıt</label>
          <span>{status.pending}</span>
          <label>Son senkron</label>
          <span>{status.lastSyncAt ? formatDateTime(status.lastSyncAt) : '—'}</span>
          {status.lastError && (
            <>
              <label>Son hata</label>
              <span className="pay-problem">{status.lastError}</span>
            </>
          )}
          <span />
          <div className="row wrap">
            <button className="btn primary" disabled={busy} onClick={() => void act(() => api.syncNow(), 'Senkron denendi.')}>
              Şimdi senkronla
            </button>
            {empty && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Buluttaki tüm veriler bu kasaya geri yüklensin mi?')) return;
                  void act(() => api.restoreFromCloud(), 'Geri yükleme tamamlandı.');
                }}
              >
                Buluttan geri yükle
              </button>
            )}
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Bulut bağlantısı kaldırılsın mı? Bekleyen kayıtlar bu bilgisayarda kalır.')) return;
                void act(() => api.disconnectCloud(), 'Bağlantı kaldırıldı.');
              }}
            >
              Bağlantıyı kaldır
            </button>
          </div>
        </div>
      ) : (
        <form
          className="panel form"
          style={{ maxWidth: 640 }}
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api.connectCloud(form);
              setForm({ url: '', anonKey: '', email: '', password: '' });
            }, 'Bulut bağlantısı kuruldu.');
          }}
        >
          <label htmlFor="cloud-url">Supabase adresi</label>
          <input id="cloud-url" className="input" placeholder="https://xxxx.supabase.co" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <label htmlFor="cloud-key">Anon key</label>
          <input id="cloud-key" className="input" value={form.anonKey} onChange={(e) => setForm({ ...form, anonKey: e.target.value })} />
          <label htmlFor="cloud-email">Cihaz e-postası</label>
          <input id="cloud-email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <label htmlFor="cloud-password">Cihaz şifresi</label>
          <input id="cloud-password" className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <span />
          <button className="btn primary" disabled={busy || !form.url || !form.anonKey || !form.email || !form.password}>
            Bağlan
          </button>
        </form>
      )}
      <p className="muted" style={{ maxWidth: 640 }}>
        Bekleyen kayıt sayısı: {status.pending}. Bulut kurulmadan da kasa tam çalışır; kayıtlar bağlantı kurulunca sırayla gönderilir.
      </p>
    </>
  );
}
