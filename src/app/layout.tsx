import type { Metadata } from "next";
import "./globals.css";
import { AppToaster } from "@/app/_components/app-toaster";
import NextTopLoader from "nextjs-toploader";

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
    <html lang="en">
      <body>
        <NextTopLoader color="#2563eb" showSpinner={false} shadow="0 0 10px #2563eb,0 0 5px #2563eb" />
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
