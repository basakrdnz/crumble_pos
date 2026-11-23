// Hesap dökümü (kullanıcı 2026-11-23): an open tab as a printable page the
// partner shares from the phone (PDF), day by day and product by product,
// with what was paid and what is left. Same rules as the tab itself: voided
// lines are left out, every line keeps the price it was sold at, the cart
// discount is one line under the total.
import { lineTotals, tabTotals } from '../calc/tab';
import { formatTL, type Kurus } from '../money';
import type { Payment, TabItem } from '../types';
import { istanbulMinute } from './analytics';
import { istanbulDay } from './dates';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export interface TabStatementInput {
  /** "CİMNASTİK", "Masa 5". */
  title: string;
  openedAt: string;
  status: 'open' | 'paid' | 'void';
  discountPercent: number | null;
  items: readonly TabItem[];
  payments: readonly Pick<Payment, 'method' | 'amount' | 'paid_at'>[];
  /** When the statement is made (Istanbul time is shown). */
  now: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clock = (iso: string) => {
  const m = istanbulMinute(iso);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
function longDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${WEEKDAYS[(d.getUTCDay() + 6) % 7]}`;
}
const dateTime = (iso: string) => {
  const day = istanbulDay(iso);
  const d = new Date(`${day}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${clock(iso)}`;
};

export interface TabStatement {
  html: string;
  total: Kurus;
  paid: Kurus;
  remaining: Kurus;
  /** Suggested file name, ASCII: "Cimnastik-hesap-dokumu-2026-11-23". */
  fileName: string;
}

export function tabStatement(input: TabStatementInput): TabStatement {
  const items = input.items.filter((i) => !i.voided_at).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const totals = tabTotals(items, input.discountPercent);
  const paid = input.payments.reduce((a, p) => a + p.amount, 0);
  const remaining = input.status === 'open' ? totals.total - paid : 0;

  const days = new Map<string, TabItem[]>();
  for (const item of items) {
    const day = istanbulDay(item.created_at);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  const products = new Map<string, { qty: number; total: Kurus }>();
  for (const item of items) {
    const p = products.get(item.name_snapshot) ?? { qty: 0, total: 0 };
    p.qty += item.quantity;
    p.total += lineTotals(item).total;
    products.set(item.name_snapshot, p);
  }
  const productRows = [...products.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'tr'));
  const qty = productRows.reduce((a, [, p]) => a + p.qty, 0);

  const daySections = [...days.entries()]
    .map(([day, lines]) => {
      const sum = lines.reduce((a, i) => a + lineTotals(i).total, 0);
      const rows = lines
        .map(
          (i) =>
            `<tr><td>${clock(i.created_at)}</td><td>${esc(i.name_snapshot)}</td><td class="n">${i.quantity}</td><td class="n">${formatTL(i.unit_price)}</td><td class="n">${formatTL(lineTotals(i).total)}</td></tr>`,
        )
        .join('');
      return `<div class="day"><div class="dh"><span>${longDay(day)}</span><span>${formatTL(sum)}</span></div><table><thead><tr><th style="width:52px">Saat</th><th>Ürün</th><th class="n" style="width:40px">Adet</th><th class="n" style="width:86px">Birim</th><th class="n" style="width:92px">Tutar</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    })
    .join('');
  const discountRow = totals.cartDiscount
    ? `<tr><td>Sepet indirimi %${input.discountPercent}</td><td class="n"></td><td class="n">−${formatTL(totals.cartDiscount)}</td></tr>`
    : '';
  const paymentSection = input.payments.length
    ? `<h2>Ödemeler</h2><table><tbody>${input.payments
        .map((p) => `<tr><td>${dateTime(p.paid_at)}</td><td>${p.method === 'cash' ? 'Nakit' : 'Kart'}</td><td class="n">${formatTL(p.amount)}</td></tr>`)
        .join('')}</tbody></table>`
    : '';
  const state = input.status === 'open' ? 'Hesap açık' : input.status === 'paid' ? 'Hesap ödendi' : 'Hesap iptal edildi';

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(input.title)} hesap dökümü</title><style>
@page { size: A4; margin: 16mm 14mm; }
body { font-family: -apple-system, 'Helvetica Neue', Roboto, 'DejaVu Sans', Arial, sans-serif; color:#1C2420; font-size:10.5pt; margin:0; }
.brand { font-family: Georgia, serif; letter-spacing:.18em; font-size:13pt; color:#1E3A2B; }
h1 { font-size:21pt; margin:6px 0 2px; }
.sub { color:#646E68; font-size:10pt; }
.sum { display:flex; gap:10px; margin:16px 0 18px; }
.box { flex:1; border:1px solid #E0E3DD; border-radius:10px; padding:10px 12px; }
.box .l { font-size:9pt; color:#646E68; font-weight:bold; } .box .v { font-size:15pt; font-weight:bold; margin-top:2px; }
.box.dark { background:#1E3A2B; color:#fff; border-color:#1E3A2B; } .box.dark .l { color:#B9CFC0; }
h2 { font-size:12.5pt; margin:18px 0 8px; color:#1E3A2B; }
.day { margin-bottom:10px; break-inside: avoid; page-break-inside: avoid; }
.dh { display:flex; justify-content:space-between; background:#EDF4EF; padding:6px 10px; border-radius:6px; font-weight:bold; }
table { width:100%; border-collapse:collapse; }
th { text-align:left; font-size:8.5pt; color:#8A938D; padding:5px 10px; border-bottom:1px solid #E0E3DD; }
td { padding:5px 10px; border-bottom:1px solid #EEF0EC; }
.n { text-align:right; }
tfoot td { font-weight:bold; border-top:2px solid #1C2420; border-bottom:0; }
.note { color:#646E68; font-size:9pt; margin-top:14px; }
.keep { break-inside: avoid; page-break-inside: avoid; }
</style></head><body>
<div class="brand">CRUMBLE</div>
<h1>Hesap dökümü · ${esc(input.title)}</h1>
<div class="sub">Açılış ${dateTime(input.openedAt)} · Döküm ${dateTime(input.now)} · ${state}</div>
<div class="sum"><div class="box dark"><div class="l">Toplam</div><div class="v">${formatTL(totals.total)}</div></div><div class="box"><div class="l">Ödenen</div><div class="v">${formatTL(paid)}</div></div><div class="box"><div class="l">Kalan</div><div class="v">${formatTL(remaining)}</div></div></div>
<h2>Gün gün</h2>
${daySections || '<div class="sub">Hesapta ürün yok.</div>'}
<div class="keep"><h2>Ürün ürün</h2><table><thead><tr><th>Ürün</th><th class="n" style="width:60px">Adet</th><th class="n" style="width:110px">Tutar</th></tr></thead><tbody>${productRows
    .map(([name, p]) => `<tr><td>${esc(name)}</td><td class="n">${p.qty}</td><td class="n">${formatTL(p.total)}</td></tr>`)
    .join('')}${discountRow}</tbody><tfoot><tr><td>Toplam</td><td class="n">${qty}</td><td class="n">${formatTL(totals.total)}</td></tr></tfoot></table></div>
${paymentSection}
<div class="note">Her ürün alındığı günün fiyatıyla yazılmıştır. Sepetten çıkarılan ürünler dökümde yer almaz.</div>
</body></html>`;

  const ascii = input.title
    .replace(/[İIı]/g, 'i')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u')
    .replace(/[Şş]/g, 's')
    .replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  const name = ascii ? ascii[0]!.toUpperCase() + ascii.slice(1) : 'Hesap';
  return { html, total: totals.total, paid, remaining, fileName: `${name}-hesap-dokumu-${istanbulDay(input.now)}` };
}
