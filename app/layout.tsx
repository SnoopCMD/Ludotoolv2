import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "../components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: 'LudoTool',
  description: '',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // On laisse le zoom accessible : LudoTool affiche des références et des
  // codes-barres qu'on a parfois besoin d'agrandir.
  maximumScale: 5,
  viewportFit: 'cover' as const,
  themeColor: '#f5f0e6',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
