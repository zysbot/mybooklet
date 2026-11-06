/**
 * 上架表單的固定選項。用選單而不是自由填寫，收藏冊分組與主辦方統計才不會被拆散
 * （例如「舞蹈」「現代舞」「舞蹈表演」會被當成三種類型）。要增減選項就改這裡。
 */
export const GENRES = ["戲劇", "喜劇", "舞蹈", "音樂", "戲曲", "親子劇", "偶戲", "音樂劇", "實驗表演", "其他"] as const;
export type Genre = (typeof GENRES)[number];

export interface Venue {
  name: string;
  city: string;
}

export const VENUES: Venue[] = [
  { name: "國家戲劇院", city: "臺北" },
  { name: "國家音樂廳", city: "臺北" },
  { name: "臺北表演藝術中心", city: "臺北" },
  { name: "臺北市中山堂", city: "臺北" },
  { name: "城市舞台", city: "臺北" },
  { name: "水源劇場", city: "臺北" },
  { name: "臺中國家歌劇院", city: "臺中" },
  { name: "臺南文化中心", city: "臺南" },
  { name: "衛武營國家藝術文化中心", city: "高雄" },
  { name: "大東文化藝術中心", city: "高雄" },
];

export const COVER_COLORS = ["#23305C", "#8A3B22", "#3E5A3A", "#5B2C45", "#7A5518", "#2F3B3F", "#1B7F72", "#8E1B1B", "#111111"];

export function isGenre(x: string): x is Genre {
  return (GENRES as readonly string[]).includes(x);
}

export function isVenue(x: string): boolean {
  return VENUES.some((v) => v.name === x);
}
