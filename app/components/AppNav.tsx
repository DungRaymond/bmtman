"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Ghi độ" },
  { href: "/thu", label: "Quản lý thu" },
  { href: "/thu/so-thu", label: "Sổ thu" },
  { href: "/chi", label: "Quản lý chi" },
  { href: "/tong-hop", label: "Tổng hợp" },
];

export function AppNav() {
  const pathname = usePathname();
  const activeHref = items
    .filter((item) =>
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(`${item.href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <header className="app-shell-header">
      <div className="brand">
        <Image src="/logo.svg" alt="" width={42} height={42} priority />
        <div>
          <div className="brand-title">BMT Badminton</div>
          <div className="brand-subtitle">Quỹ nhóm & ghi độ</div>
        </div>
      </div>
      <nav className="nav-tabs" aria-label="Điều hướng chính">
        {items.map((item) => (
          <Link
            className={activeHref === item.href ? "active" : undefined}
            aria-current={activeHref === item.href ? "page" : undefined}
            key={item.href}
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
