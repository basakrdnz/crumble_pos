import type { TabItem } from '@crumble/shared';
import { formatTL, lineTotals } from '@crumble/shared';
import type { TabDetail } from '../../db/sales';

export function Cart({
  title,
  detail,
  selectedItemId,
  onSelect,
  footer,
}: {
  title: string;
  detail: TabDetail | null;
  selectedItemId: string | null;
  onSelect(item: TabItem | null): void;
  footer: React.ReactNode;
}) {
  const items = detail?.items.filter((i) => !i.voided_at) ?? [];
  const totals = detail?.totals;
  return (
    <section className="cart" aria-label="Sepet">
      <header className="cart-head">
        <strong>{title}</strong>
        {totals && totals.itemCount > 0 && <span className="muted">{totals.itemCount} ürün</span>}
      </header>
      <div className="cart-lines" onClick={() => onSelect(null)}>
        {items.map((item) => {
          const line = lineTotals(item);
          return (
            <div
              key={item.id}
              className={`cart-line${item.id === selectedItemId ? ' selected' : ''}`}
              data-line={item.name_snapshot}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item.id === selectedItemId ? null : item);
              }}
            >
              <div className="row">
                <span className="grow name">{item.name_snapshot}</span>
                <span className="num total">{formatTL(line.total)}</span>
              </div>
              <div className="row detail">
                <span className="grow">
                  {item.quantity} × {formatTL(item.unit_price)}
                  {item.unit_price !== item.list_price && <s className="muted"> {formatTL(item.list_price)}</s>}
                </span>
                {item.is_comp && <span className="badge ok">İkram</span>}
                {item.discount_percent && !item.is_comp && <span className="badge warn">%{item.discount_percent}</span>}
                {item.unit_price !== item.list_price && <span className="badge muted">Fiyat değişti</span>}
              </div>
              {item.note && <div className="note">Not: {item.note}</div>}
            </div>
          );
        })}
        {items.length === 0 && <div className="empty">Sepet boş. Soldan ürün seçin.</div>}
      </div>
      {totals && totals.itemCount > 0 && (
        <div className="cart-totals">
          {(totals.lineDiscount > 0 || totals.cartDiscount > 0 || totals.comp > 0) && (
            <div className="row">
              <span className="grow muted">Ara toplam</span>
              <span className="num">{formatTL(totals.subtotal)}</span>
            </div>
          )}
          {totals.cartDiscount > 0 && (
            <div className="row">
              <span className="grow muted">Sepet indirimi %{detail!.tab.discount_percent}</span>
              <span className="num">−{formatTL(totals.cartDiscount)}</span>
            </div>
          )}
          {detail!.paid !== 0 && (
            <div className="row">
              <span className="grow muted">Ödenen</span>
              <span className="num">−{formatTL(detail!.paid)}</span>
            </div>
          )}
          <div className="row grand">
            <span className="grow">{detail!.paid !== 0 ? 'Kalan' : 'Toplam'}</span>
            <span className="num" data-testid="cart-total">
              {formatTL(detail!.remaining)}
            </span>
          </div>
        </div>
      )}
      <footer className="cart-actions">{footer}</footer>
    </section>
  );
}
