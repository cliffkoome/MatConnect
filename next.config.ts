import type { NextConfig } from "next";

/** Old static pages → new App Router routes, so existing bookmarks and printed QR links keep working. */
const legacyPages: Record<string, string> = {
  "/index.html": "/",
  "/login.html": "/login",
  "/signup.html": "/signup",
  "/forgot-password.html": "/forgot-password",
  "/auth-success.html": "/auth/success",
  "/select-stage.html": "/stages",
  "/feedback-page.html": "/feedback",
  "/user-profile.html": "/profile",
  "/admin-dashboard.html": "/admin",
  "/manage-stages.html": "/admin/stages",
  "/manage-users.html": "/admin/users",
  "/mat-admin-dashboard.html": "/mat-admin",
  "/mat-admin-vehicles.html": "/mat-admin/vehicles",
};

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Server-only SDKs that should be required at runtime rather than bundled.
  serverExternalPackages: ["firebase-admin", "pg", "nodemailer"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  async redirects() {
    return [
      {
        source: "/stage-info.html",
        has: [{ type: "query", key: "stageId", value: "(?<stageId>\\d+)" }],
        destination: "/stages/:stageId",
        permanent: true,
      },
      { source: "/stage-info.html", destination: "/stages", permanent: true },
      ...Object.entries(legacyPages).map(([source, destination]) => ({
        source,
        destination,
        permanent: true,
      })),
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
