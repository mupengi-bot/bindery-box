import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BINDERY BOX — AI Company-in-a-Box",
  description:
    "BINDERY BOX / MUFI Box — your AI company rendered as a living 3D virtual office. Agents, missions, approvals and the operations live-log on one Claw3D-style surface.",
};

export const viewport: Viewport = {
  themeColor: "#070b16",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
