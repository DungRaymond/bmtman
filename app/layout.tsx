import type { Metadata } from "next";
import { AppNav } from "@/app/components/AppNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ghi điểm cầu lông",
  description: "Ứng dụng ghi độ và quản lý quỹ nhóm cầu lông",
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
