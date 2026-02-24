import type { Metadata } from "next";
import "./globals.css";
import EnvironmentBanner from "@/components/EnvironmentBanner";

export const metadata: Metadata = {
  title: "Balboa",
  description: "AI-powered sales outreach intelligence",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <EnvironmentBanner />
        {children}
      </body>
    </html>
  );
}
