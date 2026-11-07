import type { ReactNode } from "react";

/**
 * 給法務頁用的極簡 Markdown：## 標題、段落、- 與 1. 清單（一層巢狀，縮排 4 格）、表格、**粗體**、`程式碼`。
 * 內容是吾冊自己寫的固定文字，不處理使用者輸入。
 */

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={i++}>{m[1]}</strong>);
    else out.push(<code key={i++}>{m[2]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

type Item = { text: string; children: { ordered: boolean; items: string[] } | null };

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{2,3})\s+(.*)$/.exec(line);
    if (h) {
      const Tag = h[1].length === 2 ? "h2" : "h3";
      blocks.push(<Tag key={key++}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i].split("|").slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div className="table-wrap" key={key++}>
          <table>
            <thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    }
    const listStart = /^(-|\d+\.)\s+/.exec(line);
    if (listStart) {
      const ordered = listStart[1] !== "-";
      const items: Item[] = [];
      while (i < lines.length) {
        const top = /^(-|\d+\.)\s+(.*)$/.exec(lines[i]);
        const sub = /^\s{2,}(-|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (top && (top[1] === "-") === !ordered) {
          items.push({ text: top[2], children: null });
        } else if (sub && items.length) {
          const last = items[items.length - 1];
          last.children ??= { ordered: sub[1] !== "-", items: [] };
          last.children.items.push(sub[2]);
        } else break;
        i++;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key++}>
          {items.map((it, j) => {
            const Sub = it.children?.ordered ? "ol" : "ul";
            return (
              <li key={j}>
                {inline(it.text)}
                {it.children && <Sub>{it.children.items.map((s, k) => <li key={k}>{inline(s)}</li>)}</Sub>}
              </li>
            );
          })}
        </List>
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3}\s|\||-\s|\d+\.\s)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={key++}>{inline(para.join(""))}</p>);
  }
  return <>{blocks}</>;
}
