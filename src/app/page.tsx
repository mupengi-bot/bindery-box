"use client";

import dynamic from "next/dynamic";

const DesktopWorkbench = dynamic(
  () => import("@/features/desktop/DesktopWorkbench"),
  {
    ssr: false,
    loading: () => (
      <div
        data-bx-theme="night"
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 14,
          background:
            "radial-gradient(1200px 700px at 50% 20%, #16203f 0%, #070b16 70%)",
          color: "#e8eefc",
        }}
      >
        <div
          style={{
            fontSize: 13,
            letterSpacing: "0.32em",
            color: "#93a0c4",
            fontWeight: 700,
          }}
        >
          BINDERY BOX DESKTOP
        </div>
        <div style={{ fontSize: 12, color: "#5b6b93" }}>
          로컬 AI 운영 작업대를 부팅하는 중…
        </div>
      </div>
    ),
  },
);

export default function Home() {
  return <DesktopWorkbench />;
}
