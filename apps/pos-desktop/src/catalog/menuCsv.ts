// Parses crumble_menu_seed.csv (plan §5.6) into an import preview. Pure: no
// database access, so the preview can be built and tested anywhere.
import { parseTL } from '@crumble/shared';

/** Minimal RFC 4180 CSV parser: quoted fields, "" escapes, CRLF/LF, BOM. */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('CSV hatalı: kapanmamış tırnak.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty lines (e.g. trailing newline).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export const MENU_COLUMNS = ['kategori', 'urun', 'fiyat_tl', 'durum', 'not'] as const;
export const MENU_STATUSES = ['tamam', 'teyit_edilecek', 'fiyat_belirlenecek'] as const;
export type MenuStatus = (typeof MENU_STATUSES)[number];

export interface ImportProduct {
  line: number;
  categoryName: string;
  name: string;
  price: number;
  isActive: boolean;
  needsPriceCheck: boolean;
  description: string | null;
  status: MenuStatus;
  /** Already in the catalog (same category + name); skipped on import. */
  exists: boolean;
}

export interface ImportCategory {
  name: string;
  exists: boolean;
  productCount: number;
}

export interface ImportPreview {
  categories: ImportCategory[];
  products: ImportProduct[];
  errors: { line: number; message: string }[];
}

export interface ExistingCatalog {
  categories: readonly { name: string }[];
  products: readonly { categoryName: string; name: string }[];
}

export function buildImportPreview(text: string, existing: ExistingCatalog): ImportPreview {
  const errors: ImportPreview['errors'] = [];
  const rows = parseCsv(text);
  const header = rows[0]?.map((h) => h.trim().toLowerCase());
  if (!header || MENU_COLUMNS.some((c, i) => header[i] !== c)) {
    return {
      categories: [],
      products: [],
      errors: [{ line: 1, message: `Başlık satırı "${MENU_COLUMNS.join(',')}" olmalı.` }],
    };
  }

  const existingCategories = new Set(existing.categories.map((c) => c.name));
  const existingProducts = new Set(existing.products.map((p) => `${p.categoryName}\u0000${p.name}`));
  const seen = new Set<string>();
  const products: ImportProduct[] = [];

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const [categoryName = '', name = '', priceText = '', statusText = '', note = ''] = cells.map((c) => c.trim());
    if (!categoryName || !name) {
      errors.push({ line, message: 'Kategori ve ürün adı zorunlu.' });
      return;
    }
    if (!(MENU_STATUSES as readonly string[]).includes(statusText)) {
      errors.push({ line, message: `Bilinmeyen durum "${statusText}".` });
      return;
    }
    const status = statusText as MenuStatus;
    const key = `${categoryName}\u0000${name}`;
    if (seen.has(key)) {
      errors.push({ line, message: `"${name}" bu kategoride iki kez yazılmış.` });
      return;
    }
    seen.add(key);

    let price = 0;
    if (status !== 'fiyat_belirlenecek') {
      try {
        price = parseTL(priceText);
      } catch {
        errors.push({ line, message: `Fiyat geçersiz: "${priceText}".` });
        return;
      }
      if (price < 0) {
        errors.push({ line, message: 'Fiyat negatif olamaz.' });
        return;
      }
    }

    products.push({
      line,
      categoryName,
      name,
      price,
      isActive: status !== 'fiyat_belirlenecek',
      needsPriceCheck: status === 'teyit_edilecek',
      description: note || null,
      status,
      exists: existingProducts.has(key),
    });
  });

  const categories: ImportCategory[] = [];
  for (const product of products) {
    let category = categories.find((c) => c.name === product.categoryName);
    if (!category) {
      category = { name: product.categoryName, exists: existingCategories.has(product.categoryName), productCount: 0 };
      categories.push(category);
    }
    category.productCount++;
  }

  return { categories, products, errors };
}
