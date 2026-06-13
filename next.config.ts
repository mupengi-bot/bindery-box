import type { NextConfig } from "next";

// Security headers, adapted from the Claw3D base. 'unsafe-eval' is only allowed
// in dev (Next HMR / source maps); production drops it — three.js and R3F do
// not need eval at runtime.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https:",
      ...(process.env.NODE_ENV !== "production"
        ? ["script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:"]
        : ["script-src 'self' 'unsafe-inline' blob:"]),
      "connect-src 'self' https:",
      "worker-src 'self' blob:",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
