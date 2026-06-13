"use client";

import dynamic from "next/dynamic";

// The 3D office is a pure client surface (WebGL). Skip SSR so three.js / R3F
// only ever mount in the browser.
const OfficeExperience = dynamic(
  () => import("@/features/office/OfficeExperience"),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 14,
          background:
            "radial-gradient(1200px 700px at 50% 20%, #16203f 0%, #070b16 70%)",
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
          BINDERY BOX
        </div>
        <div style={{ fontSize: 12, color: "#5b6b93" }}>
          가상 오피스를 부팅하는 중…
        </div>
      </div>
    ),
  },
);

export default function Home() {
  return <OfficeExperience />;
}
