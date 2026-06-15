"use client";

import dynamic from "next/dynamic";

const OfficeExperience = dynamic(
  () => import("@/features/office/OfficeExperience"),
  { ssr: false }
);

export default function OfficeViewPage() {
  return <OfficeExperience />;
}
