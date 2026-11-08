import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/struk/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      ...[
        "connect",
        "notifications",
        "dashboard",
        "tools",
        "admin",
        "invitations",
        "requests",
        "apps",
        "activity",
        "settings",
        "onboarding",
        "login",
        "signup",
        "reset-password",
        "update-password",
        "preview",
        "struk",
        "api",
      ].map((p) => ({
        source: `/${p}/:path*`,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      })),
    ];
  },
};
export default config;
