// Rapor dökümü (kullanıcı 2026-11-23): the period on the Raporlar screen (a
// day, week, month or any range) as a printable page to share as PDF. Same
// numbers as the screen: ciro by the day things were taken, money where it
// was taken, the comparison stated with its dates.
import { formatTL, type Kurus } from '../money';
import type { Category, Product } from '../types';
import { percentChange } from './analytics';
import { type PeriodSales, periodTotals, productReport, type ReportData, revenueSeries } from './reports';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dayText = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${WEEKDAYS[d.getUTCDay()]}`;
};
const stamp = (iso: string) => {
  const d = new Date(Date.parse(iso) + 3 * 3_600_000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

export interface PeriodStatementInput {
  /** "22 Kasım Cumartesi", "17 – 23 Kasım", "Kasım 2026". */
  title: string;
  /** What it is compared with, as on screen; null = no comparison. */
  prevLabel: string | null;
  before: PeriodSales | null;
  cur: ReportData;
  catalog: {
    products: readonly Pick<Product, 'id' | 'name' | 'category_id'>[];
    categories: readonly Pick<Category, 'id' | 'name' | 'sort_order'>[];
  };
  now: string;
  /** For the file name: the first and last day. */
  from: string;
  to: string;
}

export function periodStatement(input: PeriodStatementInput): { html: string; fileName: string } {
  const t = periodTotals(input.cur);
  const avg = t.salesCount ? Math.round(t.revenue / t.salesCount) : 0;
  const days = revenueSeries(input.cur, 'day');
  const products = productReport(input.cur, input.catalog.products, input.catalog.categories);
  const catTotal = Math.max(1, products.categories.reduce((a, c) => a + c.revenue, 0));

  let compare = '';
  if (input.prevLabel) {
    if (input.before) {
      const d = t.revenue - input.before.revenue;
      const pct = percentChange(t.revenue, input.before.revenue);
      compare = `<div class="cmp"><div class="l">${esc(input.prevLabel)}</div><div><b>${formatTL(input.before.revenue)}</b> · ${
        d === 0 ? 'aynı' : `${formatTL(Math.abs(d))} ${d > 0 ? 'fazla' : 'az'}${pct !== null ? ` (%${Math.abs(pct)})` : ''}`
      }</div></div>`;
    } else {
      compare = `<div class="cmp"><div class="l">${esc(input.prevLabel)}</div><div>O dönemde kasa açılmamış, karşılaştıracak veri yok.</div></div>`;
    }
  }
  const row = (cells: (string | Kurus)[], cls = '') =>
    `<tr class="${cls}">${cells.map((c, i) => `<td class="${i ? 'n' : ''}">${typeof c === 'number' ? formatTL(c) : esc(c)}</td>`).join('')}</tr>`;

  const dayRows = days.map((p) => row([dayText(p.key), String(p.totals.salesCount), p.totals.revenue, p.totals.cash, p.totals.card])).join('');
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Rapor ${esc(input.title)}</title><style>
@page { size: A4; margin: 16mm 14mm; }
body { font-family: -apple-system, 'Helvetica Neue', Roboto, 'DejaVu Sans', Arial, sans-serif; color:#1C2420; font-size:10.5pt; margin:0; }
.brand { font-family: Georgia, serif; letter-spacing:.18em; font-size:13pt; color:#1E3A2B; }
h1 { font-size:21pt; margin:6px 0 2px; }
.sub { color:#646E68; font-size:10pt; }
.sum { display:flex; gap:10px; margin:16px 0 10px; }
.box { flex:1; border:1px solid #E0E3DD; border-radius:10px; padding:10px 12px; }
.box .l, .cmp .l { font-size:9pt; color:#646E68; font-weight:bold; } .box .v { font-size:15pt; font-weight:bold; margin-top:2px; }
.box.dark { background:#1E3A2B; color:#fff; border-color:#1E3A2B; } .box.dark .l { color:#B9CFC0; }
.cmp { background:#EDF4EF; border-radius:10px; padding:10px 12px; margin-bottom:6px; }
h2 { font-size:12.5pt; margin:18px 0 6px; color:#1E3A2B; }
.keep { break-inside: avoid; page-break-inside: avoid; }
table { width:100%; border-collapse:collapse; }
th { text-align:left; font-size:8.5pt; color:#8A938D; padding:5px 10px; border-bottom:1px solid #E0E3DD; }
th.n, td.n { text-align:right; }
td { padding:5px 10px; border-bottom:1px solid #EEF0EC; }
tr.total td { font-weight:bold; border-top:2px solid #1C2420; border-bottom:0; }
.note { color:#646E68; font-size:9pt; margin-top:14px; }
</style></head><body>
<div class="brand">CRUMBLE</div>
<h1>Rapor · ${esc(input.title)}</h1>
<div class="sub">Hazırlandı ${stamp(input.now)}</div>
<div class="sum">
<div class="box dark"><div class="l">Ciro</div><div class="v">${formatTL(t.revenue)}</div></div>
<div class="box"><div class="l">Satış</div><div class="v">${t.salesCount} hesap</div></div>
<div class="box"><div class="l">Hesap başı</div><div class="v">${formatTL(avg)}</div></div>
</div>
${compare}
<div class="keep"><h2>Kasaya giren para</h2><table><tbody>${row(['Kart', t.card])}${row(['Nakit', t.cash])}</tbody></table></div>
${
  days.length > 1
    ? `<div class="keep"><h2>Gün gün</h2><table><thead><tr><th>Gün</th><th class="n">Satış</th><th class="n">Ciro</th><th class="n">Nakit</th><th class="n">Kart</th></tr></thead><tbody>${dayRows}${row(
        ['Toplam', String(t.salesCount), t.revenue, t.cash, t.card],
        'total',
      )}</tbody></table></div>`
    : ''
}
<h2>Ürünler</h2><table><thead><tr><th>Ürün</th><th class="n">Adet</th><th class="n">Ciro</th></tr></thead><tbody>${products.products
    .map((p) => row([p.name, String(p.quantity), p.revenue]))
    .join('')}${products.cartDiscount ? row(['Sepet indirimleri', '', -products.cartDiscount]) : ''}${row(['Toplam', String(products.products.reduce((a, p) => a + p.quantity, 0)), products.totalRevenue], 'total')}</tbody></table>
<div class="keep"><h2>Kategoriler</h2><table><tbody>${products.categories
    .map((c) => row([`${c.name} · %${Math.round((c.revenue / catTotal) * 100)}`, String(c.quantity), c.revenue]))
    .join('')}</tbody></table></div>
<div class="keep"><h2>Cirodan düşenler</h2><table><tbody>${row(['İndirim', t.discount])}${row(['İptal (masadan çıkarılan, iptal edilen hesap)', t.void])}${row([
    'İade',
    t.refunds,
  ])}${row(['Fiyatı değiştirilen (menü fiyatının altında)', t.priceChange])}${t.comp > 0 ? row(['İkram', t.comp]) : ''}</tbody></table></div>
<div class="note">Ciro, ödemenin alındığı güne yazılır: bir hesap ödendiği günün cirosuna girer, ödenmemiş açık hesaplar henüz ciroda yoktur. İadeler düşülür.</div>
</body></html>`;
  const fileName = input.from === input.to ? `Crumble-rapor-${input.from}` : `Crumble-rapor-${input.from}_${input.to}`;
  return { html, fileName };
}

