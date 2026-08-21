import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
// Astryx precompiled CSS (behavior + structural only). Imported BEFORE
// globals.css so Tailwind's cascade layers are declared after Astryx's and
// Tailwind utilities win conflicts. No Astryx reset is imported; AdLabs tokens
// remain authoritative via the .adlabs-astryx scope.
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "AdLabs — Creative Intelligence",
  description: "A factual archive of commercial persuasion.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#07080a] text-[#f3f4f6]">
        {children}
      </body>
    </html>
  );
}
