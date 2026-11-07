import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { TERMS_MD } from "@/content/legal";

export const metadata: Metadata = { title: "使用條款｜吾冊" };

export default function TermsPage() {
  return <LegalPage title="使用條款" source={TERMS_MD} />;
}
