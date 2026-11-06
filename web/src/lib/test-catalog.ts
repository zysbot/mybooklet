/**
 * 測試用的 10 檔虛構節目（全部名稱、內容虛構；場館為真實場館，僅作為測試參數）。
 * manual：留給營運方用上架表單手動建立，批次匯入時略過。
 * file：對應的節目單 PDF 檔名開頭。
 */
export interface TestProduction {
  file: string;
  title: string;
  company: string;
  genre: string;
  venue: string;
  startsAt: string;
  producer?: string;
  coverColor: string;
  intro: string;
  manual?: boolean;
  /** 測試觀眾領取這檔節目的機率 */
  reach: number;
}

export const TEST_PRODUCER = "港邊製作";

export const TEST_CATALOG: TestProduction[] = [
  { file: "01-", title: "潮汐備忘錄", company: "潮間帶劇團", genre: "喜劇", venue: "臺北表演藝術中心", startsAt: "2026-11-14T19:30:00+08:00", coverColor: "#23305C", manual: true, reach: 0.5,
    intro: "一座臨海小鎮的氣象站裡，退休的觀測員每天記錄潮汐，也記錄那些沒有寄出的信。" },
  { file: "02-", title: "鹽的聲音", company: "鹽舞團", genre: "舞蹈", venue: "臺中國家歌劇院", startsAt: "2026-09-13T19:30:00+08:00", coverColor: "#7A5518", reach: 0.45,
    intro: "五位舞者在鋪滿粗鹽的舞台上移動，腳步摩擦的聲音成為作品唯一的配樂。" },
  { file: "03-", title: "夜行列車", company: "雙聲室內樂團", genre: "音樂", venue: "國家音樂廳", startsAt: "2026-06-02T19:30:00+08:00", producer: TEST_PRODUCER, coverColor: "#5B2C45", reach: 0.5,
    intro: "一場從黃昏到清晨的音樂旅程，曲目依照夜車停靠的站名編排。" },
  { file: "04-", title: "白蛇・新編", company: "蘭庭戲班", genre: "戲曲", venue: "臺北市中山堂", startsAt: "2025-12-20T19:00:00+08:00", coverColor: "#8E1B1B", reach: 0.35,
    intro: "以傳統歌仔戲唱腔重新編排白蛇故事，這一次從小青的角度講起。" },
  { file: "05-", title: "月亮忘了關燈", company: "小紙船兒童劇團", genre: "親子劇", venue: "衛武營國家藝術文化中心", startsAt: "2026-08-09T14:30:00+08:00", coverColor: "#FF7A59", manual: true, reach: 0.35,
    intro: "月亮每天晚上都要記得關燈，可是今天她忘了！適合 4 歲以上的小觀眾與大朋友。" },
  { file: "06-", title: "木偶與海", company: "線影偶劇團", genre: "偶戲", venue: "水源劇場", startsAt: "2025-04-19T15:00:00+08:00", coverColor: "#2E7D8C", reach: 0.25,
    intro: "老木偶師傅在海邊撿到一塊漂流木，雕成了一個想去看海的木偶。" },
  { file: "07-", title: "港口女孩", company: "潮間帶劇團", genre: "音樂劇", venue: "國家戲劇院", startsAt: "2027-02-14T19:30:00+08:00", producer: TEST_PRODUCER, coverColor: "#1B7F72", reach: 0.7,
    intro: "1960 年代的港口，一位罐頭工廠的女孩，夢想站上碼頭邊那間歌廳的舞台。" },
  { file: "08-", title: "第三個房間", company: "小島實驗室", genre: "實驗表演", venue: "臺北表演藝術中心", startsAt: "2024-10-05T20:00:00+08:00", coverColor: "#111111", reach: 0.3,
    intro: "觀眾被分成三組，分別進入三個房間。每個房間裡發生的是同一件事。" },
  { file: "09-", title: "退潮", company: "鹽舞團", genre: "舞蹈", venue: "衛武營國家藝術文化中心", startsAt: "2025-12-06T19:30:00+08:00", producer: TEST_PRODUCER, coverColor: "#2F3B3F", reach: 0.55,
    intro: "一支關於離開的舞。被留下的，其實是看的人。" },
  { file: "10-", title: "島嶼合唱", company: "南風合唱團", genre: "音樂", venue: "臺南文化中心", startsAt: "2026-03-28T19:30:00+08:00", coverColor: "#4E7D3A", reach: 0.4,
    intro: "四十位團員，唱遍島嶼的山、海與城市。" },
];

/** 測試場次的領取時間：涵蓋演出時間，也涵蓋「現在起 30 天」，讓過去的場次也能測試領取 */
export function testClaimWindow(startsAt: string, now: Date = new Date()): { opensAt: string; closesAt: string } {
  const start = new Date(startsAt).getTime();
  const opens = Math.min(start - 90 * 60_000, now.getTime() - 60_000);
  const closes = Math.max(start + 240 * 60_000, now.getTime() + 30 * 24 * 3600_000);
  return { opensAt: new Date(opens).toISOString(), closesAt: new Date(closes).toISOString() };
}
