"use client";

import { cn } from "@/lib/utils";

export function Spinner({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-4",
    lg: "h-12 w-12 border-4",
  };
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-brand-600 border-t-transparent",
        sizes[size],
        className
      )}
      role="status"
      aria-label="Cargando"
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}
