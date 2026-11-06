import Link from "next/link";
import { formatDate } from "@/lib/format";

interface Props {
  title: string;
  companyName: string;
  startsAt: Date | string;
  color: string;
  size: "sm" | "lg" | "xl";
  /** 撕線下方右側的文字，例如「No. 0128」或「待領取」 */
  stubRight?: React.ReactNode;
  /** 卡面左上角的小字，預設 PROGRAM */
  kicker?: string;
  href?: string;
  animate?: boolean;
  ariaLabel?: string;
}

/** 節目單卡面：票根造型，與 token 圖片同一個設計 */
export function ProgramCard({ title, companyName, startsAt, color, size, stubRight, kicker = "PROGRAM", href, animate, ariaLabel }: Props) {
  const className = `card card-${size}${animate ? " rise" : ""}`;
  const inner = (
    <>
      <div className="card-body">
        <div className="card-meta">
          <span className="card-kicker">{kicker}</span>
          <div className="card-meta-bottom">
            {size !== "sm" && <span>{companyName}</span>}
            <span>{formatDate(startsAt)}</span>
          </div>
        </div>
        <span className="card-title">{title}</span>
      </div>
      <div className="card-tear" />
      <div className="card-stub">
        <span>入場紀念</span>
        {stubRight}
      </div>
      <div aria-hidden="true" className="card-notch notch-l" />
      <div aria-hidden="true" className="card-notch notch-r" />
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} style={{ background: color }} aria-label={ariaLabel ?? `《${title}》節目單`}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={className} style={{ background: color }} role="img" aria-label={ariaLabel ?? `《${title}》節目單卡面`}>
      {inner}
    </div>
  );
}
