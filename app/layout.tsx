import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ghi điểm cầu lông",
  description: "Web ghi điểm cầu lông 2v2 cho team",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
