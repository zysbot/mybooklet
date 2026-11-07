import { randomInt } from "node:crypto";

/**
 * 系統化名：「位置＋的＋動物」，例如「二樓包廂的水獺」「第十二排靠走道的狐狸」。
 * 吾冊不保存 LINE、Google 的名稱與大頭貼，觀眾在吾冊裡一律以化名出現。
 * 化名不重複（資料庫有唯一索引），觀眾不能修改（2026-11-07 決定）；頭像也由化名產生，見 avatar.ts。
 */

const PLACES = [
  "靠走道", "二樓包廂", "最後一排", "第一排", "正中央", "樓座邊邊", "側台旁", "售票口前",
  "大廳角落", "排隊最前面", "謝幕後", "中場休息", "開演前", "散場後", "後台門口", "燈控室外",
  "劇院門口", "陽台", "三樓", "樓梯口", "搖滾區", "加座", "站票區", "邊座",
  "前排", "包廂", "黑盒子裡", "小劇場", "排練場", "化妝間外", "觀眾席", "幕後",
];

const ROWS = [
  "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "二十一", "二十二", "二十三", "二十四", "二十五", "二十六", "二十七", "二十八", "二十九", "三十",
];

const SEATS = ["靠走道", "正中間", "最左邊", "最右邊"];

const ANIMALS = [
  "貓", "狐狸", "水獺", "貓頭鷹", "刺蝟", "松鼠", "兔子", "鹿",
  "浣熊", "企鵝", "海豹", "鯨魚", "海豚", "章魚", "水母", "海龜",
  "烏龜", "青蛙", "蝸牛", "蜂鳥", "麻雀", "白鷺", "鴿子", "烏鴉",
  "鸚鵡", "天鵝", "鶴", "孔雀", "黑熊", "熊貓", "無尾熊", "袋鼠",
  "羊駝", "斑馬", "長頸鹿", "大象", "河馬", "犀牛", "獅子", "老虎",
  "豹", "狼", "柴犬", "臘腸狗", "倉鼠", "樹懶", "穿山甲", "石虎",
  "藍鵲", "琵鷺", "山羌", "雲豹", "螢火蟲", "蝴蝶", "瓢蟲", "蜻蜓",
  "金魚", "鯉魚", "河豚", "海馬", "螃蟹", "龍蝦", "海獺", "駱駝",
];

/** 所有可能的位置：固定位置、第 N 排、第 N 排＋座位 */
function placeAt(i: number): string {
  if (i < PLACES.length) return PLACES[i];
  i -= PLACES.length;
  if (i < ROWS.length) return `第${ROWS[i]}排`;
  i -= ROWS.length;
  return `第${ROWS[Math.floor(i / SEATS.length)]}排${SEATS[i % SEATS.length]}`;
}

const PLACE_COUNT = PLACES.length + ROWS.length + ROWS.length * SEATS.length;
export const PSEUDONYM_SPACE = PLACE_COUNT * ANIMALS.length;

export function randomPseudonym(): string {
  return `${placeAt(randomInt(0, PLACE_COUNT))}的${ANIMALS[randomInt(0, ANIMALS.length)]}`;
}

/** 一次產生多個不重複的候選，供資料庫挑一個還沒人用的 */
export function pseudonymCandidates(count: number): string[] {
  const set = new Set<string>();
  while (set.size < count) set.add(randomPseudonym());
  return [...set];
}

/** 候選都被用掉時（化名空間快滿）加上數字，保證能產生 */
export function pseudonymWithSuffix(): string {
  return `${randomPseudonym()}${randomInt(2, 1000)}號`;
}
