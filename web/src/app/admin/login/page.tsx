import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { LoginForm } from "./LoginForm";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "營運後台登入｜吾冊", robots: { index: false } };

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");
  return (
    <main className="admin" style={{ maxWidth: 420, paddingTop: 80 }}>
      <div className="admin-top">
        <h1>吾冊 營運後台</h1>
        <span className="admin-tag">ADMIN</span>
      </div>
      <LoginForm />
    </main>
  );
}
