import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./responsive-polish.css";
const inter = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2",
      weight: "500",
    },
    {
      path: "../../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2",
      weight: "600",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});
const space = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff2",
      weight: "500",
    },
    {
      path: "../../node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff2",
      weight: "700",
    },
  ],
  variable: "--font-space",
  display: "swap",
});
export const metadata: Metadata = {
  robots: { index: process.env.INDEX_PUBLIC_CONTENT === "true", follow: true },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://prcuisa.com",
  ),
  title: {
    default: "PRCUISA — Business Systems, AI Automation & Smart Technology",
    template: "%s | PRCUISA",
  },
  description:
    "Satu PRCUISA ID untuk ekosistem tools bisnis. Temukan Business Report, QR Tools, dan ajukan kebutuhan bisnis kamu lewat PRCUISA Hub.",
  openGraph: { siteName: "PRCUISA", type: "website", locale: "id_ID" },
  twitter: { card: "summary_large_image" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className={`${inter.variable} ${space.variable}`}>
        <a className="skip" href="#main">
          Lewati ke konten
        </a>
        {children}
      </body>
    </html>
  );
}
