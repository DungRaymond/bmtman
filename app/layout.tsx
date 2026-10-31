import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ghi độ cầu lông",
  description: "Ghi và thống kê tiền độ cầu lông",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        {children}
      </body>
    </html>
  );
}
