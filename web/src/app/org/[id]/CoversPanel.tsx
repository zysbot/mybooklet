import { getDb } from "@/lib/db";
import { listOrgDesigns } from "@/lib/covers";
import { CoverUploader } from "@/components/CoverUploader";

/** 主辦方後台「節目卡面」：上傳主視覺當卡面底圖。只有發放單位看得到這一區。 */
export async function CoversPanel({ organizerId }: { organizerId: string }) {
  const designs = await listOrgDesigns(getDb(), organizerId);
  if (!designs.length) return null;
  return (
    <section className="panel" id="covers" aria-labelledby="covers-title">
      <h2 id="covers-title">節目卡面</h2>
      <p className="muted small" style={{ margin: 0, lineHeight: 1.7 }}>
        卡面會出現在吾冊首頁、領取畫面與觀眾的收藏冊。上傳主視覺或劇照，劇名、類型與日期會疊在圖片上；不上傳就是單色卡面。
        節目單內頁只有領取的觀眾看得到，請不要把內頁當卡面，保留觀眾到現場的驚喜。
      </p>
      <div className="cover-grid">
        {designs.map((d) => (
          <div key={d.designId} className="stack" style={{ gap: 8 }}>
            <strong style={{ fontSize: 14 }}>
              《{d.productionTitle}》{d.label !== "一般場" ? `・${d.label}` : ""}
            </strong>
            <CoverUploader
              designId={d.designId}
              title={d.productionTitle}
              companyName={d.companyName}
              startsAt={(d.firstShow ?? new Date()).toISOString()}
              color={d.coverColor}
              image={d.coverImage}
              genre={d.genre}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
