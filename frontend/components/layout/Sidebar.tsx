"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/store";
import {
  LayoutDashboard,
  Users,
  Package,
  Tag,
  Warehouse,
  ShoppingCart,
  Truck,
  Wallet,
  Monitor,
  BarChart3,
  BookOpen,
  Settings,
  Puzzle,
  LogOut,
  Store,
  X,
} from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/partners", label: "Clientes", icon: Users },
  { href: "/products", label: "Productos", icon: Package },
  { href: "/price-lists", label: "Listas de precios", icon: Tag },
  { href: "/inventory", label: "Inventario", icon: Warehouse },
  { href: "/sales", label: "Ventas", icon: ShoppingCart },
  { href: "/purchases", label: "Compras", icon: Truck },
  { href: "/pos", label: "Punto de Venta", icon: Monitor },
  { href: "/treasury", label: "Caja", icon: Wallet },
  { href: "/accounting", label: "Contabilidad", icon: BookOpen },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/extras", label: "Módulos extra", icon: Puzzle },
  { href: "/settings", label: "Configuración", icon: Settings },
];

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = true, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const content = (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Store className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">Gestión Comercial</p>
            <p className="text-xs text-slate-500 truncate">
              {user?.full_name || user?.email || "Usuario"}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar menú"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active ? "text-brand-600" : "text-slate-400")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={() => {
            logout();
            window.location.href = "/login";
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        {content}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
          <aside className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
