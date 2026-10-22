"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Store } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { login, getMe } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

export default function LoginPage() {
  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const tokens = await login(email, password);
      setTokens(tokens.access_token, tokens.refresh_token);
      const user = await getMe();
      setUser(user);
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Error al iniciar sesión";
      setError(typeof msg === "string" ? msg : "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 bg-gradient-to-br from-brand-700 to-brand-900 lg:flex lg:flex-col lg:justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <Store className="h-8 w-8" />
          <span className="text-xl font-bold">Gestión Comercial</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            Gestioná tu negocio<br />de punta a punta
          </h1>
          <p className="mt-4 text-brand-100 text-lg max-w-md">
            Ventas, compras, inventario, caja y POS en un solo sistema.
            Configuración guiada para cualquier tipo de empresa.
          </p>
        </div>
        <p className="text-sm text-brand-200">Multi-empresa · Multi-sucursal · Didáctico</p>
      </div>

      <div className="flex w-full flex-col justify-center px-6 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <h2 className="text-2xl font-bold text-slate-900">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-slate-500">
            Ingresá a tu cuenta o{" "}
            <Link href="/onboarding" className="text-brand-600 hover:underline font-medium">
              registrá tu empresa
            </Link>
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <Input
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@empresa.com"
              required
              autoComplete="email"
            />
            <Input
              id="password"
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" size="lg" loading={loading}>
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
