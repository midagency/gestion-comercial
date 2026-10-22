"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useAuthStore } from "@/lib/store";
import { getMe } from "@/lib/api";
import { Sidebar } from "./Sidebar";
import { Spinner } from "@/components/ui/Spinner";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { accessToken, setUser, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    getMe()
      .then((user) => {
        setUser(user);
        setReady(true);
      })
      .catch(() => {
        logout();
        router.replace("/login");
      });
  }, [accessToken, router, setUser, logout]);

  if (!accessToken || !ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex lg:hidden items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-slate-900">Gestión Comercial</span>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
