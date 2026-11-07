/**
 * 閱讀器的翻頁單位。
 * 單頁：每一頁一個畫面。跨頁（寬螢幕）：封面單獨一頁，之後兩頁一組（2–3、4–5…），最後一頁可能單獨。
 */
export function buildSpreads(total: number, spread: boolean): number[][] {
  if (total <= 0) return [];
  if (!spread) return Array.from({ length: total }, (_, i) => [i]);
  const out: number[][] = [[0]];
  for (let i = 1; i < total; i += 2) out.push(i + 1 < total ? [i, i + 1] : [i]);
  return out;
}

/** 某一頁在第幾個畫面 */
export function spreadOfPage(spreads: number[][], page: number): number {
  const i = spreads.findIndex((s) => s.includes(page));
  return i < 0 ? 0 : i;
}

/** 頁碼文字：單頁「3 / 12」，跨頁「2–3 / 12」 */
export function pageLabel(spread: number[] | undefined, total: number): string {
  if (!spread || spread.length === 0) return `0 / ${total}`;
  const a = spread[0] + 1;
  const b = spread[spread.length - 1] + 1;
  return `${a === b ? a : `${a}–${b}`} / ${total}`;
}

export type ReadingDirection = "ltr" | "rtl";
