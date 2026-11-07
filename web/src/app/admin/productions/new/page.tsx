import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { ProductionForm } from "./ProductionForm";
import { getDb } from "@/lib/db";
import { listOrganizerNames, listWorkTitles } from "@/lib/productions";
import "../../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "上架節目｜吾冊後台", robots: { index: false } };

export default async function NewProductionPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <main className="admin">
      <Link href="/admin" className="back">← 回到後台</Link>
      <h1>上架節目</h1>
      <ProductionForm workTitles={await listWorkTitles(getDb())} organizers={await listOrganizerNames(getDb())} />
    </main>
  );
}
