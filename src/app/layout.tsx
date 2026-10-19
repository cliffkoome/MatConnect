import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MatConnect", template: "%s · MatConnect" },
  description: "Real-time matatu arrival information for passengers, fleet owners and administrators.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- loaded once for the whole app */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;900&display=swap"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display -- icon font: "block" avoids flashing ligature text */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=block" />
      </head>
      <body>{children}</body>
    </html>
  );
}
