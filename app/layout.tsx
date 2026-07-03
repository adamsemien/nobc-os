import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Playfair_Display, Cormorant_Garamond, DM_Sans, DM_Mono, Plus_Jakarta_Sans, Fraunces, DM_Serif_Display, Space_Grotesk, Syne, Instrument_Serif } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { clerkAppearance, clerkLocalization } from "@/lib/clerk-appearance";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  style: ["normal", "italic"],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

// Base for resolving relative OG/twitter image paths to the absolute URLs
// link unfurlers require. Same fallback as app/e/[slug]/page.tsx and
// lib/email-templates.ts.
const SITE_BASE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ?? "https://app.thenobadcompany.com"
).replace(/\/+$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_BASE_URL),
  title: "NoBC OS",
  description: "No Bad Company member platform",
  manifest: "/manifest.json",
  // Site-wide share-card defaults so any URL unfurls as No Bad Company.
  // Pages with their own openGraph (/apply, /e/[slug]) override wholesale.
  // og-default.png is a functional placeholder pending final art from Chloe.
  openGraph: {
    siteName: "No Bad Company",
    title: "No Bad Company",
    description: "No Bad Company member platform",
    type: "website",
    images: [{ url: "/og-default.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "No Bad Company",
    description: "No Bad Company member platform",
    images: ["/og-default.png"],
  },
};

// viewport-fit=cover lets env(safe-area-inset-*) engage so fixed/sticky bars can
// clear the iPhone notch / home indicator. (MOBILE-IPHONE-AUDIT-2026-06-22, #1.)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider afterSignOutUrl="/signed-out" appearance={clerkAppearance} localization={clerkLocalization}>
      <html lang="en" data-theme="nobc" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} ${cormorantGaramond.variable} ${dmSans.variable} ${dmMono.variable} ${plusJakarta.variable} ${fraunces.variable} ${dmSerifDisplay.variable} ${spaceGrotesk.variable} ${syne.variable} ${instrumentSerif.variable} font-sans antialiased`}
        >
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
          <a href="#main-content" className="skip-to-main">Skip to main content</a>
          <div id="main-content">
            <Providers>{children}</Providers>
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
