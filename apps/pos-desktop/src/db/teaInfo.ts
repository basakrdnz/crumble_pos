// Bitki çayı bilgi penceresi (2026-10-30): the sale screen sells only
// "Bitki Çayı (Küçük/Büyük)"; an "i" button on those tiles lists the teas and
// what is in them, for telling customers. Information only: choosing a tea
// changes nothing in the sale. Kept on this POS in the settings table.
import type { Context } from './database';

export interface HerbalTea {
  name: string;
  ingredients: string;
}

const KEY = 'herbal_teas';

// The cafe's teas (Chado Tea, 250 g). Ingredients from the producer's product
// pages, 2026-10-30; editable in Ayarlar → Bitki çayı bilgisi.
export const DEFAULT_HERBAL_TEAS: readonly HerbalTea[] = [
  { name: 'Yılbaşı Çayı', ingredients: 'Rooibos, tarçın, karanfil, elma, kuşburnu, portakal kabuğu. Kafeinsiz.' },
  { name: 'Turmeric Chai', ingredients: 'Zerdeçal, zencefil, tarçın, kakule, gül yaprağı, hindistan cevizi. Kafeinsiz.' },
  { name: 'Digestea', ingredients: 'Rezene, rooibos, zencefil, lavanta, portakal kabuğu. Kafeinsiz, yemek sonrası için.' },
  { name: 'Immuni-Tea', ingredients: 'Adaçayı, kekik, okaliptüs, zencefil. Kafeinsiz.' },
  { name: 'Rooibos Chai', ingredients: 'Rooibos, tarçın, kakule, karanfil, portakal kabuğu. Kafeinsiz.' },
  { name: 'Calm Tea', ingredients: 'Lavanta, tulsi (fesleğen), rezene, tarçın. Akşam için sakinleştirici.' },
];

/** Tiles that get the "i" button. */
export function isHerbalTeaProduct(name: string): boolean {
  return name.toLocaleLowerCase('tr').startsWith('bitki çayı');
}

export function getHerbalTeas(ctx: Context): HerbalTea[] {
  const raw = ctx.db.prepare('select value from settings where key = ?').pluck().get(KEY) as string | undefined;
  return raw === undefined ? [...DEFAULT_HERBAL_TEAS] : (JSON.parse(raw) as HerbalTea[]);
}

export function setHerbalTeas(ctx: Context, teas: readonly HerbalTea[]): HerbalTea[] {
  const clean = teas
    .map((t) => ({ name: t.name.trim(), ingredients: t.ingredients.trim() }))
    .filter((t) => t.name);
  ctx.db
    .prepare('insert into settings (key, value) values (?, ?) on conflict (key) do update set value = excluded.value')
    .run(KEY, JSON.stringify(clean));
  return clean;
}
