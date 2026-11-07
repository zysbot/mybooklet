/**
 * 頭像：由化名產生，觀眾不能修改，也不保存任何照片。
 * 例如「二樓包廂的水獺」→ 一個「獺」字的印章，底色由整個化名決定。
 * 化名不重複；兩個化名偶爾可能得到相同的字與顏色，畫面上一律同時顯示化名。
 */

const COLORS = [
  "#23305C", "#7A5518", "#5B2C45", "#8E1B1B", "#2E7D8C", "#1B7F72",
  "#2F3B3F", "#4E7D3A", "#B8432F", "#6B4E9B", "#9C6B1E", "#3E5C8A",
  "#7D3C5A", "#456B5E", "#A14D2A", "#4A4A6A",
];

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 化名裡的動物（「…的」之後，去掉化名用完時加上的「N號」） */
export function animalOf(pseudonym: string): string {
  const i = pseudonym.lastIndexOf("的");
  const tail = i >= 0 ? pseudonym.slice(i + 1) : pseudonym;
  return tail.replace(/\d+號$/, "") || pseudonym;
}

export interface AvatarSpec {
  char: string;
  background: string;
  /** 0–2：印章外框的樣式，讓同字同色的機會再少一些 */
  ring: number;
}

export function avatarFor(pseudonym: string): AvatarSpec {
  const animal = animalOf(pseudonym);
  const chars = [...animal];
  const h = hash(pseudonym);
  return {
    char: chars[chars.length - 1] ?? "？",
    background: COLORS[h % COLORS.length],
    ring: Math.floor(h / COLORS.length) % 3,
  };
}
