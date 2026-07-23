import type { Metadata, Viewport } from "next";
import { Inter, Lora } from "next/font/google";
import "./globals.css";
import { getSiteUrl } from "@/lib/site";
import { Analytics } from "@vercel/analytics/next";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "Tapsa — a navigable map of ideas",
    template: "%s · Tapsa",
  },
  description:
    "Enter any topic in science or history and travel a living map of connected ideas — including the adjacent concepts you didn't know to ask about.",
  openGraph: {
    title: "Tapsa — a navigable map of ideas",
    description:
      "Travel a living map of connected ideas in science and history.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#fbfbfa",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
