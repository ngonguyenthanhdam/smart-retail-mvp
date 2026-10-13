"use client";

import { CircleAlert, LoaderCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth-provider";
import { vi } from "@/i18n/vi";
import { canAccessSection, defaultRoute, findSection } from "@/lib/navigation";

export function AuthBoundary({ children }: { children: ReactNode }) {
  const { status, user, retry } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/login";
  const isRecovery = pathname === "/forgot-password" || pathname === "/reset-password";
  const section = findSection(pathname.split("/")[1]);
  const masterPage = pathname.startsWith("/products/categories") || pathname.startsWith("/products/units");
  const denied = user !== null && ((section !== undefined && !canAccessSection(user.role, section.id)) || (masterPage && user.role !== "ADMIN"));

  useEffect(() => {
    if (status === "unauthenticated" && !isLogin && !isRecovery) router.replace("/login");
    if (user && (isLogin || denied)) router.replace(defaultRoute(user.role));
  }, [status, user, isLogin, isRecovery, denied, router]);

  if (isRecovery) return children;

  if (status === "error") {
    return (
      <main className="auth-screen">
        <div className="auth-status" role="alert">
          <CircleAlert size={30} aria-hidden="true" />
          <h1>{vi.auth.unavailableTitle}</h1>
          <p>{vi.auth.unavailableDescription}</p>
          <button type="button" className="primary-button" onClick={retry}>{vi.auth.retry}</button>
        </div>
      </main>
    );
  }

  if (status === "loading" || denied || (user && isLogin) || (!user && !isLogin)) {
    return (
      <main className="auth-screen">
        <div className="auth-status" role="status">
          <LoaderCircle className="loading-icon" size={26} aria-hidden="true" />
          <p>{vi.auth.loading}</p>
        </div>
      </main>
    );
  }

  return user ? <AppShell>{children}</AppShell> : children;
}
