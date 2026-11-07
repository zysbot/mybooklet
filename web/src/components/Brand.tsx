import Link from "next/link";

/** 左上角品牌字樣，點了回首頁 */
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="吾冊 My Booklet 首頁">
      <span className="brand-zh">吾冊</span>
      <span className="brand-en">My Booklet</span>
    </Link>
  );
}
