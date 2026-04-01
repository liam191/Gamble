import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "UPchain Casino",
  description: "Coin Flip & Dice on UPchain",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full ${outfit.variable} ${jakarta.variable}`}>
      <body className="min-h-full flex flex-col antialiased"
        style={{ background: 'var(--surface-0)', color: 'var(--text-primary)' }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
