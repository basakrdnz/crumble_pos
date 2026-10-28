import { api } from '../../api/client';
import { useAction, useApiData } from '../../components/useApi';

function size(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Local backups and the error log (plan Faz 7). */
export function Maintenance() {
  const [backups, reloadBackups] = useApiData(() => api.listBackups());
  const [log, reloadLog] = useApiData(() => api.readLog(200));
  const run = useAction();
  return (
    <>
      <h2>Yedek ve günlük</h2>
      <div className="panel" style={{ maxWidth: 760, marginBottom: 16 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <strong className="grow">Yerel yedekler</strong>
          <button
            className="btn"
            onClick={() =>
              void run(async () => {
                await api.backupNow();
                await reloadBackups();
              }, 'Yedek alındı.')
            }
          >
            Şimdi yedekle
          </button>
          <button className="btn" onClick={() => void run(() => api.openBackupFolder())}>
            Klasörü aç
          </button>
        </div>
        <p className="muted">
          Her gün otomatik bir kopya alınır, son 30 gün saklanır. Bulut (Supabase) ayrıca kendi yedeğini tutar. Bir yedeğe dönmek
          için: uygulamayı kapatın, yedek dosyasını veri klasörüne <code>crumble.sqlite</code> adıyla kopyalayın.
        </p>
        <table className="grid" aria-label="Yedekler">
          <tbody>
            {(backups ?? []).map((b) => (
              <tr key={b.name}>
                <td>{b.day}</td>
                <td className="muted">{b.name}</td>
                <td className="num">{size(b.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {backups?.length === 0 && <div className="empty">Henüz yedek yok.</div>}
      </div>

      <div className="panel" style={{ maxWidth: 1000 }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <strong className="grow">Hata günlüğü (son 200 kayıt)</strong>
          <button className="btn" onClick={() => void reloadLog()}>
            Yenile
          </button>
          <button className="btn" onClick={() => void run(() => api.openLogFolder())}>
            Klasörü aç
          </button>
        </div>
        <pre className="log" aria-label="Hata günlüğü">
          {(log ?? []).join('\n') || 'Kayıt yok.'}
        </pre>
      </div>
    </>
  );
}
