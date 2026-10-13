"use client";

import { ChevronRight, Languages, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { vi } from "@/i18n/vi";
import { canAccessSection, defaultRoute, findSection, navigation, navigationGroups } from "@/lib/navigation";
import { useAuth } from "@/components/auth-provider";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const activeSection = findSection(pathname.split("/")[1]);
  const currentTitle = activeSection
    ? vi.sections[activeSection.id].label
    : vi.notFound.title;

  if (!user) return null;

  const visibleNavigation = navigation.filter((item) => canAccessSection(user.role, item.id));

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(false);
    try {
      await signOut();
    } catch {
      setSignOutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {vi.shell.skipToContent}
      </a>

      <aside className="sidebar">
        <div className="brand-row">
          <Link className="brand-link" href={defaultRoute(user.role)} onClick={() => setMenuOpen(false)}>
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span>
              <span className="brand-name">{vi.brand}</span>
              <span className="brand-subtitle">{vi.shell.subtitle}</span>
            </span>
          </Link>
          <button
            type="button"
            className="menu-toggle"
            aria-label={vi.shell.toggleNavigation}
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
          </button>
        </div>

        <div className={`sidebar-content${menuOpen ? " is-open" : ""}`} id="main-navigation">
          <nav aria-label={vi.shell.navigation}>
            {navigationGroups.filter((group) => visibleNavigation.some((item) => item.group === group)).map((group) => (
              <div className="nav-group" key={group}>
                <p className="nav-group-label">{vi.shell.groups[group]}</p>
                <ul className="space-y-1">
                  {visibleNavigation.filter((item) => item.group === group).map((item) => {
                    const isActive = activeSection?.id === item.id;
                    const Icon = item.icon;

                    return (
                      <li key={item.id}>
                        <Link
                          className={`nav-link${isActive ? " is-active" : ""}`}
                          href={`/${item.id}`}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => setMenuOpen(false)}
                        >
                          <Icon size={19} strokeWidth={1.75} aria-hidden="true" />
                          <span>{vi.sections[item.id].label}</span>
                          {isActive && <span className="nav-active-dot" aria-hidden="true" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="account-panel">
            <p className="account-name">{user.fullName}</p>
            <p className="account-role">{vi.auth.roles[user.role]}</p>
            <p className="account-location">{user.role === "ADMIN" ? vi.auth.allLocations : user.location?.name}</p>
            <button type="button" className="sign-out-button" onClick={handleSignOut} disabled={signingOut}>
              <LogOut size={16} aria-hidden="true" />
              {signingOut ? vi.auth.signingOut : vi.auth.signOut}
            </button>
            {signOutError && <p className="field-error" role="alert">{vi.auth.signOutFailed}</p>}
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-root">{vi.shell.workspace}</span>
            <ChevronRight className="breadcrumb-root" size={14} aria-hidden="true" />
            <span className="font-medium text-ink">{currentTitle}</span>
          </div>
          <span className="language-label" aria-label={vi.shell.languageLabel}>
            <Languages size={16} aria-hidden="true" />
            {vi.shell.language}
          </span>
        </header>

        <main className="main-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
