"use client";

import { useRouter } from "next/navigation";

export function LogoutAdmin() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="link-btn"
      style={{ background: "transparent", font: "inherit", fontSize: 13, cursor: "pointer" }}
      onClick={async () => {
        await fetch("/api/admin/login", { method: "DELETE" });
        router.replace("/admin/login");
        router.refresh();
      }}
    >
      登出
    </button>
  );
}
