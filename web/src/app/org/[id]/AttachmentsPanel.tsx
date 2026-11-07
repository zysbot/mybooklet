import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { currentOrgAccount } from "@/lib/org-session";
import { isOrgMember, logAccess } from "@/lib/org-accounts";
import { getFileStore } from "@/lib/storage";
import { ATTACHMENT_LIMIT, taipeiToday, type Plan } from "@/lib/plans";
import { addAttachment, AttachmentError, linkHost, listOrgAttachments, removeAttachment, type Attachment } from "@/lib/attachments";

/** 誰在操作：營運方或這個組織的工作帳號；都不是回傳 null */
async function actorFor(organizerId: string): Promise<string | null> {
  if (await isAdmin()) return "營運方";
  const account = await currentOrgAccount();
  if (account && (await isOrgMember(getDb(), organizerId, account.id))) return account.email;
  return null;
}

function Item({ a, organizerId, expired }: { a: Attachment; organizerId: string; expired?: boolean }) {
  // 伺服器動作只帶需要的值
  const attachmentId = a.id;
  const attachmentTitle = a.title;
  async function remove() {
    "use server";
    const actor = await actorFor(organizerId);
    if (!actor) redirect("/org");
    const db = getDb();
    if (await removeAttachment(db, organizerId, attachmentId)) {
      if (actor !== "營運方") await logAccess(db, organizerId, actor, "attachment_removed", attachmentTitle);
    }
    redirect(`/org/${organizerId}#attachments`);
  }
  const kind = a.fileKind === "image" ? "圖片" : a.fileKind === "pdf" ? "PDF" : null;
  return (
    <li className="att-row">
      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
        <strong>{a.title}</strong>
        <span className="small muted">
          {[kind, a.linkUrl ? `連結：${linkHost(a.linkUrl)}` : null, a.showUntil ? `顯示到 ${a.showUntil}` : "不設期限"].filter(Boolean).join("・")}
          {expired ? "・已過期" : ""}
        </span>
      </div>
      <span className="small" style={{ whiteSpace: "nowrap" }}>點開 {a.clicks} 次</span>
      <form action={remove}>
        <button type="submit" className="link-btn">移除</button>
      </form>
    </li>
  );
}

/**
 * 主辦方後台「附加文宣」：放在自己節目單下方給觀眾的資料。
 * 只有演出團隊（節目的 organizer）能管理；製作方與場館看不到這一區。
 */
export async function AttachmentsPanel({ organizerId, plan, error }: { organizerId: string; plan: Plan; error?: string }) {
  const list = await listOrgAttachments(getDb(), organizerId);
  if (!list.length) return null;
  const limit = ATTACHMENT_LIMIT[plan];

  return (
    <section className="panel" id="attachments" aria-labelledby="att-title">
      <div className="panel-head">
        <h2 id="att-title">附加文宣</h2>
        <span className="small muted">每檔節目最多 {limit} 則{plan === "free" ? "（免費方案）" : ""}</span>
      </div>
      <p className="muted small" style={{ margin: 0, lineHeight: 1.7 }}>
        放在節目單下方，只有領過這檔節目的觀眾看得到，例如下一檔演出、觀眾問卷、周邊商品或優惠。吾冊不推播、不寄信；觀眾自己打開節目單時才會看到。
        連結只接受 https，觀眾點了會先看到要前往的網站。只提供點開的總次數，不提供是誰點的。內容須符合相關法規（例如酒類廣告應有警語），詳見
        <a href="/terms/organizers" target="_blank" rel="noreferrer">主辦方服務條款</a>。
      </p>
      {error && <p className="error" role="alert">{error}</p>}

      {list.map((p) => {
        const productionId = p.productionId;
        async function add(fd: FormData) {
          "use server";
          const actor = await actorFor(organizerId);
          if (!actor) redirect("/org");
          const file = fd.get("file");
          let msg: string | null = null;
          try {
            const f = file instanceof File && file.size > 0 ? file : null;
            const db = getDb();
            const a = await addAttachment(db, getFileStore(), {
              organizerId,
              productionId,
              title: String(fd.get("title") ?? ""),
              note: String(fd.get("note") ?? ""),
              link: String(fd.get("link") ?? ""),
              showUntil: String(fd.get("until") ?? ""),
              file: f ? { bytes: new Uint8Array(await f.arrayBuffer()), contentType: f.type } : null,
              actor,
            });
            if (actor !== "營運方") await logAccess(db, organizerId, actor, "attachment_added", a.title);
          } catch (err) {
            if (!(err instanceof AttachmentError)) throw err;
            msg = err.message;
          }
          redirect(msg ? `/org/${organizerId}?attError=${encodeURIComponent(msg)}#attachments` : `/org/${organizerId}#attachments`);
        }
        const full = p.active.length >= limit;
        return (
          <div key={p.productionId} className="att-prod">
            <h3 className="sub" style={{ color: "var(--ink)" }}>《{p.title}》</h3>
            {p.active.length + p.expired.length > 0 && (
              <ul className="att-list">
                {p.active.map((a) => <Item key={a.id} a={a} organizerId={organizerId} />)}
                {p.expired.map((a) => <Item key={a.id} a={a} organizerId={organizerId} expired />)}
              </ul>
            )}
            {full ? (
              <p className="small muted" style={{ margin: 0 }}>已達 {limit} 則，要新增請先移除一則。</p>
            ) : (
              <details className="att-add">
                <summary className="link-btn">新增一則</summary>
                <form action={add} className="form-grid" style={{ marginTop: 12 }}>
                  <label className="field">
                    標題（40 字以內）
                    <input name="title" maxLength={40} required placeholder="例如：下一檔演出《港口女孩》開賣" />
                  </label>
                  <label className="field">
                    說明（選填，120 字以內）
                    <input name="note" maxLength={120} />
                  </label>
                  <label className="field">
                    圖片或 PDF（選填，4 MB 以內）
                    <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
                  </label>
                  <label className="field">
                    連結（選填，https:// 開頭）
                    <input name="link" type="url" inputMode="url" placeholder="https://" pattern="https://.*" />
                  </label>
                  <label className="field">
                    顯示到（選填，當天仍顯示）
                    <input name="until" type="date" min={taipeiToday()} />
                  </label>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button type="submit" className="btn btn-primary">新增</button>
                  </div>
                </form>
              </details>
            )}
          </div>
        );
      })}
    </section>
  );
}
