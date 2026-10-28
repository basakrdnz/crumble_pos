import { buildImportPreview, type ImportPreview } from '../catalog/menuCsv';
import { createCategory, createProduct, listCategories, listProducts } from './catalog';
import { type Context, tx } from './database';

export function previewMenuImport(ctx: Context, text: string): ImportPreview {
  const categories = listCategories(ctx);
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const products = listProducts(ctx).map((p) => ({ categoryName: nameById.get(p.category_id) ?? '', name: p.name }));
  return buildImportPreview(text, { categories, products });
}

export interface ImportResult {
  categoriesCreated: number;
  productsCreated: number;
  productsSkipped: number;
}

/**
 * Imports the CSV in one transaction. The preview is rebuilt from the current
 * catalog here (not taken from the screen), so products that already exist are
 * skipped and running the import twice creates nothing new.
 */
export function applyMenuImport(ctx: Context, text: string): ImportResult {
  return tx(ctx, () => {
    const preview = previewMenuImport(ctx, text);
    if (preview.errors.length > 0) {
      throw new Error(`CSV'de ${preview.errors.length} hata var, içe aktarma yapılmadı.`);
    }
    const categoryIds = new Map(listCategories(ctx).map((c) => [c.name, c.id]));
    let categoriesCreated = 0;
    for (const category of preview.categories) {
      if (!categoryIds.has(category.name)) {
        categoryIds.set(category.name, createCategory(ctx, category.name).id);
        categoriesCreated++;
      }
    }
    let productsCreated = 0;
    for (const product of preview.products) {
      if (product.exists) continue;
      createProduct(ctx, {
        category_id: categoryIds.get(product.categoryName)!,
        name: product.name,
        price: product.price,
        description: product.description,
        is_active: product.isActive,
        needs_price_check: product.needsPriceCheck,
      });
      productsCreated++;
    }
    return {
      categoriesCreated,
      productsCreated,
      productsSkipped: preview.products.length - productsCreated,
    };
  });
}
