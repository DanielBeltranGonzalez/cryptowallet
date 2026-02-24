import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CryptoWallet",
  description: "Crypto wallet app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <footer className="fixed bottom-0 left-0 right-0 text-center text-xs text-gray-500 py-2 bg-black/60 backdrop-blur-sm">
          &copy; <a href="mailto:tacombel@gmail.com" className="hover:text-gray-300">tacombel@gmail.com</a>
          {" · "}v1.3.0
        </footer>
      </body>
    </html>
  );
}
