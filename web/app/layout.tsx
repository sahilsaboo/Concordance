import type { Metadata, Viewport } from "next";
import { Archivo, Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display serif for headings: thin, high-contrast, like the reference title.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

// Wide sans for small uppercase labels. The wdth axis lets us stretch it to 125%.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const description =
  "Compare GLP-1 medications on independent, bias-rated, cited evidence, ranked by what matters to you.";

export const metadata: Metadata = {
  title: { default: "Concordance: compare GLP-1 options on independent evidence", template: "%s | Concordance" },
  description,
  applicationName: "Concordance",
  openGraph: { title: "Concordance", description, type: "website", siteName: "Concordance" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcf8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#2d2d23" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} ${archivo.variable} h-full antialiased`}
      // The theme script below may add data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        {/* Applies a saved light/dark choice before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
