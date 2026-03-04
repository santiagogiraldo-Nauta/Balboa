import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import EnvironmentBanner from "@/components/EnvironmentBanner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Balboa — Nauta Sales Platform",
  description: "AI-powered sales outreach intelligence by Nauta",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <EnvironmentBanner />
        {children}
      </body>
    </html>
  );
}
