import Link from "next/link";

export function Brand() {
  return (
    <Link href="/me" className="brand" aria-label="吾冊 My Booklet，我的收藏冊">
      <span className="brand-zh">吾冊</span>
      <span className="brand-en">My Booklet</span>
    </Link>
  );
}
