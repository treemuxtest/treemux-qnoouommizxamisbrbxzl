import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neon Drift Pulse",
  description: "An instantly playable one-page canvas arcade toy with punchy collisions and screen shake.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
