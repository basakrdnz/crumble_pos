import type { TabItem } from '@crumble/shared';
import { DISCOUNT_PRESETS, formatTL, istanbulDay, lineTotals } from '@crumble/shared';
import { Fragment, type ReactNode } from 'react';
import type { TabDetail } from '../../db/sales';
import { formatLongDate } from '../../format';

/**
 * Cart column: lines (click opens the line panel; a click on the empty area
 * closes it), subtotal, cart discount
 * (Yok / %10 / %15 / Elle) and the total. Payment buttons come in `footer`.
 */
export function Cart({
  title,
  subtitle,
  tools,
  banner,
  detail,
  selectedItemId,
  onSelect,
  onRemove,
  onDiscount,
  onTypeDiscount,
  typingDiscount,
  footer,
}: {
  title: string;
  subtitle?: string;
  tools?: ReactNode;
  banner?: ReactNode;
  detail: TabDetail | null;
  selectedItemId: string | null;
  onSelect(item: TabItem | null): void;
  /** "×" on a line: removes it (kept as a void record, like "Satırı çıkar"). */
  onRemove?(item: TabItem): void;
  onDiscount(percent: number | null): void;
  onTypeDiscount(): void;
  typingDiscount: boolean;
  footer: ReactNode;
}) {
  const items = detail?.items.filter((i) => !i.voided_at) ?? [];
  const totals = detail?.totals;
  const percent = detail?.tab.discount_percent ?? null;
  const custom = percent !== null && !(DISCOUNT_PRESETS as readonly number[]).includes(percent);
  const hasItems = (totals?.itemCount ?? 0) > 0;
  // A tab kept over several days shows a dated divider where the day changes
  // (2026-11-04: "hangi gün ne alındı").
  const days = new Set(items.map((i) => istanbulDay(i.created_at)));
  const dividers = days.size > 1;

  return (
    <section className="cart" aria-label="Sepet">
      <header className="cart-head">
        <div>
          <strong>{title}</strong>
          <span className="muted">
            {subtitle ?? (hasItems ? `${items.length} satır · ${totals!.itemCount} ürün` : 'Sepet boş')}
          </span>
        </div>
        {tools}
      </header>
      {banner}
      <div className="cart-lines" onClick={() => onSelect(null)}>
        {items.map((item, index) => {
          const line = lineTotals(item);
          const changed = item.unit_price !== item.list_price;
          const day = istanbulDay(item.created_at);
          const newDay = dividers && (index === 0 || istanbulDay(items[index - 1]!.created_at) !== day);
          return (
            <Fragment key={item.id}>
            {newDay && (
              <div className="cart-day" data-day={day}>
                <span>{formatLongDate(item.created_at)}</span>
              </div>
            )}
            <div
              className={`cart-line${item.id === selectedItemId ? ' selected' : ''}`}
              data-line={item.name_snapshot}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(item);
              }}
            >
              <span className="qty-box">{item.quantity}</span>
              <div className="body">
                <div className="top">
                  <span>{item.name_snapshot}</span>
                  <span className="num total">{formatTL(line.total)}</span>
                </div>
                <div className="detail">
                  <span>{changed ? `menü ${formatTL(item.list_price)}` : `${formatTL(item.unit_price)} / adet`}</span>
                  {changed && <span className="badge muted">Fiyat değişti</span>}
                  {/* Older records may still carry a line discount or ikram. */}
                  {item.discount_percent && !item.is_comp && <span className="badge info">satıra %{item.discount_percent}</span>}
                  {item.is_comp && <span className="badge muted">İkram</span>}
                </div>
                {item.note && <div className="note">Not: {item.note}</div>}
              </div>
              {onRemove && (
                <button
                  className="remove-line"
                  aria-label={`${item.name_snapshot} sil`}
                  title="Satırı sil"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(item);
                  }}
                >
                  ×
                </button>
              )}
            </div>
            </Fragment>
          );
        })}
        {items.length === 0 && <div className="empty">Sepet boş. Soldan ürün seçin.</div>}
      </div>
      {hasItems && (
        <div className="cart-totals">
          <div className="line">
            <span>Ara toplam</span>
            <span className="num">{formatTL(totals!.subtotal)}</span>
          </div>
          <div className="disc-head">
            <span>İndirim</span>
            <span className="num">{totals!.cartDiscount > 0 ? `−${formatTL(totals!.cartDiscount)}` : '—'}</span>
          </div>
          <div className="seg" role="group" aria-label="Sepet indirimi">
            <button className={percent === null && !typingDiscount ? 'on' : ''} onClick={() => onDiscount(null)}>
              Yok
            </button>
            {DISCOUNT_PRESETS.map((p) => (
              <button key={p} className={percent === p && !typingDiscount ? 'on' : ''} onClick={() => onDiscount(p)} aria-label={`Sepet %${p}`}>
                %{p}
              </button>
            ))}
            <button className={custom || typingDiscount ? 'on' : ''} onClick={onTypeDiscount} aria-label="Sepet indirimi elle">
              {custom ? `%${percent}` : 'Elle'}
            </button>
          </div>
          {detail!.paid !== 0 && (
            <>
              <div className="line">
                <span>Hesap toplamı</span>
                <span className="num">{formatTL(totals!.total)}</span>
              </div>
              <div className="line" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                <span>Ödenen</span>
                <span className="num">−{formatTL(detail!.paid)}</span>
              </div>
            </>
          )}
        </div>
      )}
      {hasItems && (
        <div className="cart-grand">
          <span>{detail!.paid !== 0 ? 'Kalan' : 'Toplam'}</span>
          <span className="num" data-testid="cart-total">
            {formatTL(detail!.remaining)}
          </span>
        </div>
      )}
      <footer className="cart-actions">{footer}</footer>
    </section>
  );
}
