// 產生測試節目的示範卡面圖（全部由程式繪製，沒有版權問題），輸出到 public/test-covers/。
// 執行：node scripts/gen-test-covers.mjs
// 卡面上會疊劇名與漸層：左下角放字、右側較暗，所以圖案的重點放在上半部。
import { mkdirSync, writeFileSync } from "node:fs";

const W = 600;
const H = 820;

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const f = (n) => Math.round(n * 10) / 10;

function svg(body, defs = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>\n`;
}
// 漸層以整張畫布為準（不是每個圖形自己的範圍），挖空的形狀才會跟背景同色
const lin = (id, stops, x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${x2 * W}" y2="${y2 * H}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
const rad = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</radialGradient>`;

/** 一條起伏的線（海浪、山稜） */
function wave(y, amp, len, phase, r, jitter = 0) {
  let d = `M -20 ${f(y)}`;
  for (let x = -20; x <= W + 20; x += 20) d += ` L ${x} ${f(y + Math.sin((x / len) * Math.PI * 2 + phase) * amp + (jitter ? (r() - 0.5) * jitter : 0))}`;
  return d;
}

const covers = {
  // 01 潮汐備忘錄：夜裡的海、月亮、海邊的小氣象站
  "01": () => {
    const r = rng(1);
    let lines = "";
    for (let i = 0; i < 14; i++) lines += `<path d="${wave(430 + i * 26, 6 + i * 0.6, 260 + i * 12, i * 0.7, r)}" fill="none" stroke="#C9D6F2" stroke-opacity="${f(0.55 - i * 0.03)}" stroke-width="1.6"/>`;
    let stars = "";
    for (let i = 0; i < 60; i++) stars += `<circle cx="${f(r() * W)}" cy="${f(r() * 360)}" r="${f(0.6 + r() * 1.4)}" fill="#fff" fill-opacity="${f(0.3 + r() * 0.6)}"/>`;
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#sky)"/>${stars}
<circle cx="430" cy="170" r="70" fill="url(#moon)"/><circle cx="430" cy="170" r="150" fill="url(#halo)"/>
<path d="M 0 ${H} L 0 420 Q 150 400 300 425 T ${W} 418 L ${W} ${H} Z" fill="#141C38"/>${lines}
<g fill="#E9E2D0"><rect x="96" y="300" width="34" height="120"/><path d="M 88 300 L 113 268 L 138 300 Z"/><rect x="106" y="318" width="14" height="18" fill="#F6C76A"/></g>
<line x1="113" y1="268" x2="113" y2="236" stroke="#E9E2D0" stroke-width="3"/><path d="M 113 240 L 140 246 L 113 252 Z" fill="#E9E2D0"/>`,
      lin("sky", [[0, "#0F1734"], [1, "#2C3D78"]]) + rad("moon", [[0, "#FFF9E6"], [1, "#F2E3B8"]]) + rad("halo", [[0, "#F2E3B8", 0.25], [1, "#F2E3B8", 0]])
    );
  },
  // 02 鹽的聲音：鋪滿鹽粒的地面，舞者的腳步劃出弧線
  "02": () => {
    const r = rng(2);
    let salt = "";
    for (let i = 0; i < 550; i++) {
      const y = r() * H;
      salt += `<circle cx="${f(r() * W)}" cy="${f(y)}" r="${f(0.6 + r() * 2.2 * (y / H + 0.3))}" fill="#FFF8EA" fill-opacity="${f(0.25 + r() * 0.6)}"/>`;
    }
    let arcs = "";
    for (let i = 0; i < 6; i++) {
      const cx = 120 + r() * 360;
      const cy = 160 + r() * 260;
      const rr = 60 + r() * 140;
      arcs += `<path d="M ${f(cx - rr)} ${f(cy)} A ${f(rr)} ${f(rr * 0.55)} 0 0 1 ${f(cx + rr)} ${f(cy)}" fill="none" stroke="#5A3A0C" stroke-opacity="0.55" stroke-width="${f(6 + r() * 10)}" stroke-linecap="round"/>`;
    }
    return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>${arcs}${salt}`, lin("g", [[0, "#D9B98A"], [1, "#7A5518"]]));
  },
  // 03 夜行列車：車窗外流過的燈光
  "03": () => {
    const r = rng(3);
    let streaks = "";
    for (let i = 0; i < 46; i++) {
      const y = 60 + r() * 520;
      const x = r() * W;
      const len = 80 + r() * 260;
      const c = ["#F6C76A", "#F28AA8", "#9FD3F5", "#FFFFFF"][Math.floor(r() * 4)];
      streaks += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + len)}" y2="${f(y - len * 0.08)}" stroke="${c}" stroke-opacity="${f(0.25 + r() * 0.6)}" stroke-width="${f(1 + r() * 4)}" stroke-linecap="round"/>`;
    }
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>${streaks}
<rect x="40" y="40" width="520" height="560" rx="46" fill="none" stroke="#2A1220" stroke-width="28"/>
<line x1="300" y1="40" x2="300" y2="600" stroke="#2A1220" stroke-width="18"/>
<path d="M 0 ${H} L 0 640 L ${W} 640 L ${W} ${H} Z" fill="#2A1220"/>`,
      lin("g", [[0, "#1C0F2E"], [0.6, "#5B2C45"], [1, "#8C4A5E"]])
    );
  },
  // 04 白蛇・新編：白色蛇形曲線穿過水紋
  "04": () => {
    const r = rng(4);
    let waves = "";
    for (let i = 0; i < 9; i++) waves += `<path d="${wave(380 + i * 34, 10, 140, i, r)}" fill="none" stroke="#F4D6C6" stroke-opacity="0.28" stroke-width="2"/>`;
    const snake = "M 520 60 C 300 80 520 220 300 250 C 80 280 320 420 140 470 C 40 500 60 560 120 590";
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/><circle cx="420" cy="160" r="110" fill="#B83A2A" fill-opacity="0.5"/>${waves}
<path d="${snake}" fill="none" stroke="#3A0A0A" stroke-opacity="0.35" stroke-width="44" stroke-linecap="round" transform="translate(10 12)"/>
<path d="${snake}" fill="none" stroke="#FBF5EC" stroke-width="40" stroke-linecap="round"/>
<path d="${snake}" fill="none" stroke="#E7D9C4" stroke-width="40" stroke-linecap="round" stroke-dasharray="6 14"/>
<circle cx="516" cy="58" r="5" fill="#2A0A0A"/>`,
      lin("g", [[0, "#5E0F12"], [1, "#8E1B1B"]])
    );
  },
  // 05 月亮忘了關燈：大大的月亮，像檯燈一樣照下一道光
  "05": () => {
    const r = rng(5);
    let stars = "";
    for (let i = 0; i < 26; i++) {
      const x = r() * W;
      const y = r() * 380;
      const s = 4 + r() * 8;
      stars += `<path d="M ${f(x)} ${f(y - s)} L ${f(x + s * 0.3)} ${f(y - s * 0.3)} L ${f(x + s)} ${f(y)} L ${f(x + s * 0.3)} ${f(y + s * 0.3)} L ${f(x)} ${f(y + s)} L ${f(x - s * 0.3)} ${f(y + s * 0.3)} L ${f(x - s)} ${f(y)} L ${f(x - s * 0.3)} ${f(y - s * 0.3)} Z" fill="#FFF3C4" fill-opacity="${f(0.6 + r() * 0.4)}"/>`;
    }
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>
<path d="M 330 230 L 120 ${H} L 600 ${H} L 600 560 Z" fill="url(#beam)"/>${stars}
<circle cx="360" cy="190" r="118" fill="#FFF3C4"/><circle cx="410" cy="160" r="100" fill="url(#g)"/>
<path d="M 470 40 L 470 96" stroke="#3B1F4A" stroke-width="4"/><circle cx="470" cy="104" r="10" fill="#FFF3C4"/>
<path d="M 0 700 Q 150 640 300 690 T 600 670 L 600 ${H} L 0 ${H} Z" fill="#3B1F4A" fill-opacity="0.6"/>`,
      lin("g", [[0, "#3B1F4A"], [0.55, "#B9475A"], [1, "#FF7A59"]]) + lin("beam", [[0, "#FFF3C4", 0.55], [1, "#FFF3C4", 0]])
    );
  },
  // 06 木偶與海：懸線吊著的漂流木，下面是海
  "06": () => {
    const r = rng(6);
    let waves = "";
    for (let i = 0; i < 10; i++) waves += `<path d="${wave(480 + i * 30, 12, 180, i * 1.3, r)}" fill="none" stroke="#DDF3F2" stroke-opacity="${f(0.5 - i * 0.03)}" stroke-width="2.5"/>`;
    const wood = "M 150 300 C 200 280 260 300 330 290 C 390 282 430 300 470 296 L 466 318 C 420 324 380 312 330 318 C 270 326 210 314 156 324 Z";
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>
<line x1="190" y1="0" x2="190" y2="296" stroke="#F4EFE6" stroke-width="1.5"/><line x1="320" y1="0" x2="320" y2="292" stroke="#F4EFE6" stroke-width="1.5"/><line x1="440" y1="0" x2="440" y2="298" stroke="#F4EFE6" stroke-width="1.5"/>
<rect x="150" y="40" width="330" height="14" rx="7" fill="#C8A57A"/>
<path d="${wood}" fill="#C8A57A"/><path d="M 190 306 C 260 300 330 308 430 304" fill="none" stroke="#8A6A44" stroke-width="2"/>
<circle cx="452" cy="305" r="4" fill="#3A2A18"/>
<path d="M 0 ${H} L 0 470 Q 300 440 ${W} 470 L ${W} ${H} Z" fill="#1E5A66"/>${waves}`,
      lin("g", [[0, "#9CD3D3"], [1, "#2E7D8C"]])
    );
  },
  // 07 港口女孩：港邊的吊車剪影與舞台的聚光燈
  "07": () => {
    const r = rng(7);
    let lights = "";
    for (let i = 0; i < 18; i++) lights += `<circle cx="${f(40 + i * 31)}" cy="${f(96 + Math.sin(i / 2.6) * 18)}" r="6" fill="#FFE29A" fill-opacity="${f(0.6 + r() * 0.4)}"/>`;
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>
<path d="M 20 90 Q 300 140 580 90" fill="none" stroke="#0E3F39" stroke-width="2"/>${lights}
<path d="M 300 120 L 120 600 L 480 600 Z" fill="url(#spot)"/>
<ellipse cx="300" cy="600" rx="190" ry="26" fill="#FFE29A" fill-opacity="0.35"/>
<g fill="#0E3F39"><rect x="430" y="220" width="16" height="380"/><rect x="380" y="220" width="200" height="12"/><line x1="438" y1="160" x2="560" y2="226" stroke="#0E3F39" stroke-width="4"/><line x1="438" y1="160" x2="380" y2="226" stroke="#0E3F39" stroke-width="4"/><rect x="432" y="150" width="12" height="80"/><line x1="560" y1="232" x2="560" y2="330" stroke="#0E3F39" stroke-width="2"/><rect x="548" y="330" width="24" height="18"/></g>
<g fill="#0E3F39"><rect x="70" y="300" width="12" height="300"/><rect x="40" y="300" width="130" height="10"/><line x1="160" y1="310" x2="160" y2="380" stroke="#0E3F39" stroke-width="2"/></g>
<path d="M 0 600 L ${W} 600 L ${W} ${H} L 0 ${H} Z" fill="#0E3F39"/>`,
      lin("g", [[0, "#F2A65A"], [0.5, "#3EA08F"], [1, "#1B7F72"]]) + lin("spot", [[0, "#FFF4D0", 0.75], [1, "#FFF4D0", 0.05]])
    );
  },
  // 08 第三個房間：三扇門，只有一扇亮著
  "08": () => {
    const door = (x, lit) =>
      `<rect x="${x}" y="170" width="120" height="240" fill="${lit ? "url(#lit)" : "#1E1E1E"}" stroke="#3A3A3A" stroke-width="2"/>` +
      (lit ? `<path d="M ${x} 410 L ${x - 60} 640 L ${x + 180} 640 L ${x + 120} 410 Z" fill="#F4EFE6" fill-opacity="0.12"/>` : "");
    return svg(
      `<rect width="${W}" height="${H}" fill="#111"/>
<path d="M 0 410 L ${W} 410" stroke="#2C2C2C" stroke-width="2"/>
<path d="M 300 410 L 0 760 M 300 410 L 600 760 M 300 410 L 300 ${H}" stroke="#1F1F1F" stroke-width="2"/>
${door(50, false)}${door(240, true)}${door(430, false)}
<text x="300" y="150" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#6A6A6A" letter-spacing="10">I  II  III</text>`,
      lin("lit", [[0, "#FFF7E0"], [1, "#E9C77A"]])
    );
  },
  // 09 退潮：一層層往後退的水線，留下一個小小的人影
  "09": () => {
    const r = rng(9);
    let bands = "";
    for (let i = 0; i < 12; i++) {
      const y = 180 + i * i * 4.2;
      bands += `<path d="${wave(y, 3 + i * 0.6, 300, i, r)} L ${W + 20} ${H} L -20 ${H} Z" fill="#B7C6C4" fill-opacity="${f(0.05 + i * 0.012)}"/>`;
    }
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>${bands}
<circle cx="420" cy="120" r="34" fill="#E6E1D3" fill-opacity="0.85"/>
<g fill="#1A2224"><circle cx="210" cy="508" r="7"/><rect x="204" y="516" width="12" height="34" rx="5"/></g>
<line x1="210" y1="552" x2="210" y2="600" stroke="#1A2224" stroke-opacity="0.35" stroke-width="10"/>`,
      lin("g", [[0, "#7E8E8D"], [1, "#2F3B3F"]])
    );
  },
  // 10 島嶼合唱：層層的山與海，聲音像漣漪擴散
  "10": () => {
    const r = rng(10);
    const hills = [
      ["#A8C98E", 330, 50],
      ["#7FAE66", 380, 40],
      ["#5C8E46", 430, 34],
      ["#3F6B2E", 480, 26],
    ]
      .map(([c, y, a], i) => `<path d="${wave(y, a, 340 + i * 60, i * 1.7, r, 10)} L ${W + 20} ${H} L -20 ${H} Z" fill="${c}"/>`)
      .join("");
    let rings = "";
    for (let i = 1; i <= 7; i++) rings += `<circle cx="300" cy="230" r="${i * 34}" fill="none" stroke="#FFF8E7" stroke-opacity="${f(0.55 - i * 0.06)}" stroke-width="2"/>`;
    return svg(
      `<rect width="${W}" height="${H}" fill="url(#g)"/>${rings}<circle cx="300" cy="230" r="18" fill="#FFF8E7"/>${hills}`,
      lin("g", [[0, "#F7D9A6"], [1, "#9CC7B4"]])
    );
  },
};

mkdirSync("public/test-covers", { recursive: true });
for (const [n, make] of Object.entries(covers)) writeFileSync(`public/test-covers/${n}.svg`, make());
console.log(`已產生 ${Object.keys(covers).length} 張示範卡面：public/test-covers/`);
