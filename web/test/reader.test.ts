import { describe, it, expect } from "vitest";
import { buildSpreads, pageLabel, spreadOfPage } from "@/lib/reader";

describe("閱讀器翻頁單位", () => {
  it("單頁：每頁一個畫面", () => {
    expect(buildSpreads(3, false)).toEqual([[0], [1], [2]]);
  });
  it("跨頁：封面單獨，之後兩頁一組，最後一頁可能單獨", () => {
    expect(buildSpreads(6, true)).toEqual([[0], [1, 2], [3, 4], [5]]);
    expect(buildSpreads(5, true)).toEqual([[0], [1, 2], [3, 4]]);
    expect(buildSpreads(1, true)).toEqual([[0]]);
    expect(buildSpreads(0, true)).toEqual([]);
  });
  it("換版面時停在同一頁", () => {
    const spread = buildSpreads(8, true);
    expect(spreadOfPage(spread, 4)).toBe(2); // 3–4 那一組（第 4、5 頁）
    expect(spreadOfPage(buildSpreads(8, false), 3)).toBe(3);
  });
  it("頁碼文字", () => {
    expect(pageLabel([2], 12)).toBe("3 / 12");
    expect(pageLabel([1, 2], 12)).toBe("2–3 / 12");
  });
});
