import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/config/providers";
import { FloatingWalletManager } from "@/components/floating-wallet-manager";
import { UpdateBanner } from "@/components/update-banner";

import Script from "next/script";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });


export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090b",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://www.thearcfun.xyz"),
  title: "ArcFun",
  description: "Non-custodial cross-chain bridge powered by Circle CCTP.",
  applicationName: "ArcFun",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg?v=6", type: "image/svg+xml" },
      { url: "/favicon-48x48.png?v=6", type: "image/png", sizes: "48x48" },
      { url: "/favicon-32x32.png?v=6", type: "image/png", sizes: "32x32" },
      { url: "/icon-192x192.png?v=6", type: "image/png", sizes: "192x192" },
      { url: "/favicon.ico?v=6", sizes: "any" },
    ],
    shortcut: "/favicon.ico?v=6",
    apple: [
      { url: "/apple-touch-icon.png?v=6", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ArcFun",
  },
  openGraph: {
    title: "ArcFun",
    description: "Non-custodial cross-chain bridge powered by Circle CCTP.",
    url: "https://www.thearcfun.xyz",
    siteName: "ArcFun",
    images: [{ url: "https://www.thearcfun.xyz/rocket-logo.png", width: 800, height: 600, alt: "ArcFun" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ArcFun",
    description: "Non-custodial cross-chain bridge powered by Circle CCTP.",
    images: ["https://www.thearcfun.xyz/rocket-logo.png"],
    creator: "@ArcFunTerminal",
  },
  alternates: {
    canonical: "https://www.thearcfun.xyz",
  },
  verification: {
    google: "LqcjsK7SG959QYQTh-ODejYumlwm-xMSbGqx9FuB62k",
  },
  other: {
    "base:app_id": "6a817fe2e4a8a41598e7a461",
  }
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "ArcFun",
  "url": "https://www.thearcfun.xyz",
  "description": "Non-custodial cross-chain bridge powered by Circle CCTP and on-chain token launchpad.",
  "publisher": {
    "@type": "Organization",
    "name": "ArcFun",
    "url": "https://www.thearcfun.xyz",
    "logo": "https://www.thearcfun.xyz/rocket-logo.png",
    "sameAs": [
      "https://x.com/ArcFunTerminal",
      "https://x.com/0x_zax"
    ]
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${plusJakarta.variable} ${geist.variable} ${geistMono.variable} antialiased`}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@900,700,600,500,400&display=swap" rel="stylesheet" />
        <Script
          id="json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Script
          id="error-suppression"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                window.addEventListener('error', function(event) {
                  if (event.filename && event.filename.indexOf('chrome-extension') !== -1) {
                    event.stopImmediatePropagation();
                  }
                  if (event.message && (event.message.indexOf('aptos') !== -1 || event.message.indexOf('Martian') !== -1)) {
                    event.stopImmediatePropagation();
                  }
                }, true);
                window.addEventListener('unhandledrejection', function(event) {
                  if (event.reason && event.reason.stack && event.reason.stack.indexOf('chrome-extension') !== -1) {
                    event.stopImmediatePropagation();
                  }
                }, true);
              })();
            `
          }}
        />
      </head>
      <body className="font-sans transition-colors duration-200" style={{ margin: 0, padding: 0, overflow: "hidden", width: "100%", height: "100%", background: "var(--bg)", color: "var(--text-primary)" }}>
        <Providers>
          {children}
          <FloatingWalletManager />
          <UpdateBanner />
        </Providers>
      </body>
    </html>
  );
}
