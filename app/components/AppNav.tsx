import Image from "next/image";
import Link from "next/link";

const items = [
  { href: "/", label: "Ghi độ" },
  { href: "/thu", label: "Quản lý thu" },
  { href: "/chi", label: "Quản lý chi" },
  { href: "/tong-hop", label: "Tổng hợp" },
];

export function AppNav() {
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
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
