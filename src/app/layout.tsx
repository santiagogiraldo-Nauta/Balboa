import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nauta LinkedIn Sales Agent",
  description: "AI-powered LinkedIn intelligence for Nauta sales team",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
