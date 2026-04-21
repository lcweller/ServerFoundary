import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GameServerOS — Host Game Servers in Minutes",
  description:
    "Deploy and manage game servers for you and your friends. Run one command. No Linux experience required.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
