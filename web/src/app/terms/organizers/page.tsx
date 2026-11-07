import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { ORG_TERMS_MD } from "@/content/legal";

export const metadata: Metadata = { title: "主辦方服務條款｜吾冊" };

export default function OrganizerTermsPage() {
  return <LegalPage title="主辦方服務條款" source={ORG_TERMS_MD} />;
}
