import { formatTL, istanbulDay, lineTotals } from '@crumble/shared';
import { Fragment } from 'react';
import { api } from '../api/client';
import { formatLongDate, formatTime } from '../format';
import { useApiData } from './useApi';

/**
 * "Hesabı gör" (2026-11-04): what an open tab took, day by day, with payments
 * and what is left. Read only.
 */
export function TabViewDialog({ tabId, title, onClose }: { tabId: string; title: string; onClose(): void }) {
  const [detail] = useApiData(() => api.getTab(tabId), [tabId]);
  const items = detail?.items ?? [];
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog tab-view" role="dialog" aria-label={`${title} hesabı`} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {detail && (
          <>
            <p className="muted" style={{ margin: '0 0 10px' }}>
              Açılış {formatLongDate(detail.tab.opened_at)} {formatTime(detail.tab.opened_at)}
            </p>
            <div className="lines">
              {items.map((item, i) => {
                const day = istanbulDay(item.created_at);
                const newDay = i === 0 || istanbulDay(items[i - 1]!.created_at) !== day;
                return (
                  <Fragment key={item.id}>
                    {newDay && (
                      <div className="cart-day">
                        <span>{formatLongDate(item.created_at)}</span>
                      </div>
                    )}
                    <div className={`row-line${item.voided_at ? ' voided' : ''}`}>
                      <span>
                        {item.quantity} × {item.name_snapshot}
                      </span>
                      <span className="num">{item.voided_at ? 'çıkarıldı' : formatTL(lineTotals(item).total)}</span>
                    </div>
                  </Fragment>
                );
              })}
            </div>
            {detail.totals.cartDiscount > 0 && (
              <div className="row-line">
                <span>Sepet indirimi %{detail.tab.discount_percent}</span>
                <span className="num">−{formatTL(detail.totals.cartDiscount)}</span>
              </div>
            )}
            <div className="sum">
              <span>Toplam</span>
              <span className="num">{formatTL(detail.totals.total)}</span>
            </div>
            {detail.paid > 0 && (
              <div className="row-line">
                <span>Alınan</span>
                <span className="num">{formatTL(detail.paid)}</span>
              </div>
            )}
            <div className="sum" data-testid="tab-view-remaining">
              <span>Kalan</span>
              <span className="num">{formatTL(detail.remaining)}</span>
            </div>
          </>
        )}
        <div className="actions">
          <button className="btn" autoFocus onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
