import { escapeXml, formatDate } from "./format";

/**
 * 節目單卡面（token 圖案）：票根造型，直排標題、撕線、入場紀念。
 * 產生 SVG，給錢包與區塊鏈瀏覽器顯示 token 圖片用。
 */
export function renderCoverSvg(opts: {
  title: string;
  companyName: string;
  startsAt: Date;
  color: string;
  label?: string;
}): string {
  const W = 440;
  const H = 600;
  const stubTop = 492;
  const ink = "#F4EFE6";
  const color = /^#[0-9a-fA-F]{6}$/.test(opts.color) ? opts.color : "#23305C";
  const title = escapeXml(opts.title);
  const titleSize = opts.title.length > 5 ? 52 : 64;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <mask id="notch">
      <rect width="${W}" height="${H}" fill="#fff"/>
      <circle cx="0" cy="${stubTop}" r="16" fill="#000"/>
      <circle cx="${W}" cy="${stubTop}" r="16" fill="#000"/>
    </mask>
  </defs>
  <g mask="url(#notch)">
    <rect width="${W}" height="${H}" rx="20" fill="${color}"/>
  </g>
  <text x="36" y="58" fill="${ink}" font-family="sans-serif" font-size="18" letter-spacing="6">PROGRAM</text>
  <text x="${W - 70}" y="44" fill="${ink}" font-family="'Noto Serif TC', serif" font-weight="700" font-size="${titleSize}" letter-spacing="10" writing-mode="vertical-rl" style="writing-mode: vertical-rl">${title}</text>
  <text x="36" y="430" fill="${ink}" font-family="sans-serif" font-size="20">${escapeXml(opts.companyName)}</text>
  <text x="36" y="460" fill="${ink}" fill-opacity="0.85" font-family="sans-serif" font-size="20">${formatDate(opts.startsAt)}</text>
  <line x1="28" y1="${stubTop}" x2="${W - 28}" y2="${stubTop}" stroke="${ink}" stroke-opacity="0.5" stroke-width="3" stroke-dasharray="10 8"/>
  <text x="36" y="556" fill="${ink}" font-family="sans-serif" font-size="20" letter-spacing="4">入場紀念</text>
  ${opts.label ? `<text x="${W - 36}" y="556" text-anchor="end" fill="${ink}" font-family="sans-serif" font-size="20">${escapeXml(opts.label)}</text>` : ""}
</svg>`;
}
