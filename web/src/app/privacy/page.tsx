import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { PRIVACY_MD } from "@/content/legal";

export const metadata: Metadata = { title: "隱私權政策｜吾冊" };

export default function PrivacyPage() {
  return <LegalPage title="隱私權政策" source={PRIVACY_MD} />;
}
