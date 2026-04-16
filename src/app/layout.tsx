import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Sora } from "next/font/google";
import "./globals.css";
import { AppToaster } from "@/app/_components/app-toaster";
import { AppQueryProvider } from "@/app/_components/query-provider";
import { PwaRegistration } from "@/app/_components/pwa-registration";
import NextTopLoader from "nextjs-toploader";

const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Sora({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "DukaanHQ",
  description: "DukaanHQ is a SaaS for electronics shops to manage products, create bills, and generate invoices faster.",
  applicationName: "DukaanHQ",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
    shortcut: "/logo.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DukaanHQ",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <AppQueryProvider>
          <PwaRegistration />
          <NextTopLoader color="#0c0a09" height={4} showSpinner={false} shadow="0 0 10px rgba(12,10,9,0.35),0 0 5px rgba(12,10,9,0.25)" />
          {children}
          <AppToaster />
        </AppQueryProvider>
      </body>
    </html>
  );
}
