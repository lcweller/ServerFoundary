import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ServerForge — Game servers that deploy themselves",
  description:
    "Deploy and manage game servers for you and your friends. Run one command. No Linux experience required.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      {/* eslint-disable @next/next/no-page-custom-font */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;450;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* eslint-enable @next/next/no-page-custom-font */}
      <body className="min-h-screen bg-hx-app-bg font-sans text-hx-fg antialiased">
        {children}
      </body>
    </html>
  );
}
