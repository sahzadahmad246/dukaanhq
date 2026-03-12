import type { Metadata } from "next";
import "./globals.css";
import { AppToaster } from "@/app/_components/app-toaster";

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
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
