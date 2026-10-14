import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SelecionarAoFocar from "@/components/selecionar-ao-focar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "US Decor — Portal interno",
  description: "Gestão interna da US Decor: produtos, estoque, pedidos dos marketplaces e financeiro",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "US Decor",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#131A2E",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SelecionarAoFocar />
        {children}
      </body>
    </html>
  );
}