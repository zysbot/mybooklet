import Link from "next/link";
import { formatDate } from "@/lib/format";

interface Props {
  title: string;
  companyName: string;
  startsAt: Date | string;
  color: string;
  /** 主辦方上傳的卡面圖片：當底圖，上面疊漸層讓文字清楚 */
  image?: string | null;
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
/** 卡面底色：有圖就用圖＋漸層，沒圖就是單色 */
export function cardBackground(color: string, image?: string | null): React.CSSProperties {
  if (!image) return { background: color };
  return {
    backgroundColor: color,
    backgroundImage: `linear-gradient(to left, rgba(20,18,16,0.62), rgba(20,18,16,0) 58%), linear-gradient(to top, rgba(20,18,16,0.78), rgba(20,18,16,0.1) 42%, rgba(20,18,16,0) 70%), url("${image.replace(/"/g, "%22")}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

export function ProgramCard({ title, companyName, startsAt, color, image, size, stubRight, kicker = "PROGRAM", href, animate, ariaLabel }: Props) {
  const className = `card card-${size}${animate ? " rise" : ""}${image ? " card-has-image" : ""}`;
  const bg = cardBackground(color, image);
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
        <span className={`card-title${[...title].length > 14 ? " card-title-longer" : [...title].length > 7 ? " card-title-long" : ""}`}>{title}</span>
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
      <Link href={href} className={className} style={bg} aria-label={ariaLabel ?? `《${title}》節目單`}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={className} style={bg} role="img" aria-label={ariaLabel ?? `《${title}》節目單卡面`}>
      {inner}
    </div>
  );
}
