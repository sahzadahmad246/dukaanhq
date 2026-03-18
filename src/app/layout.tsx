import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans, Sora } from "next/font/google";
import "./globals.css";
import { AppToaster } from "@/app/_components/app-toaster";
import { AppQueryProvider } from "@/app/_components/query-provider";
import NextTopLoader from "nextjs-toploader";

const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Sora({
  subsets: ["latin"],
  variable: "--font-display",
});

const uiFont = DM_Sans({
  subsets: ["latin"],
  variable: "--font-ui",
});

export const metadata: Metadata = {
  title: "DukaanHQ",
  description: "Mobile-first SaaS for retail shops, billing, inventory, and storefronts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable} ${uiFont.variable}`}>
      <body>
        <AppQueryProvider>
          <NextTopLoader color="#111827" showSpinner={false} shadow="0 0 10px rgba(17,24,39,0.35),0 0 5px rgba(17,24,39,0.25)" />
          {children}
          <AppToaster />
        </AppQueryProvider>
      </body>
    </html>
  );
}
