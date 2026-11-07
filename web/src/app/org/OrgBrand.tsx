import { Brand } from "@/components/Brand";

/** 主辦方後台最上方：吾冊字樣（回首頁） */
export function OrgBrand() {
  return (
    <div className="org-brand">
      <Brand />
      <span className="small muted">主辦方後台</span>
    </div>
  );
}
