import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

const displaySans = Space_Grotesk({
  variable: "--font-display-sans",
  subsets: ["latin"],
});

const uiMono = Space_Mono({
  variable: "--font-ui-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Pulse Garden",
  description:
    "A one-page interactive particle toy with magnetic brush physics, chain-reaction pulses, and synth feedback.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${displaySans.variable} ${uiMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
