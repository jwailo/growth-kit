import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Growth Kit — Ailo",
  description: "Internal marketing and growth tools for Ailo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body
        className="min-h-full"
        style={{
          fontFamily:
            '"Helvetica Neue", Helvetica, Arial, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
