import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display, Cormorant_Garamond, DM_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
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

export const metadata: Metadata = {
  title: "NoBC OS",
  description: "No Bad Company member platform",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" data-theme="nobc" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} ${playfairDisplay.variable} ${cormorantGaramond.variable} ${dmSans.variable} font-sans antialiased`}
        >
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
          <a href="#main-content" className="skip-to-main">Skip to main content</a>
          <div id="main-content">
            {children}
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
