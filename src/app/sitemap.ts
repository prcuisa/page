import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  if (process.env.INDEX_PUBLIC_CONTENT !== "true") return [];
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://prcuisa.com";
  return ["", "/products", "/products/business-report", "/products/qr-tools", "/products/invoice"].map((p) => ({ url: origin + p }));
}
