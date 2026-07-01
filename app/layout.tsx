import type { Metadata } from "next";
import { AppNav } from "@/app/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ghi điểm cầu lông",
  description: "Web ghi điểm cầu lông 2v2 cho team",
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
