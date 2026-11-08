import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/", "/struk/"] },
    sitemap:
      (process.env.NEXT_PUBLIC_SITE_URL || "https://prcuisa.com") +
      "/sitemap.xml",
  };
}
