"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { logout } from "@/lib/client/api";
import { DEFAULT_AVATAR } from "@/lib/client/hooks";
import type { Profile } from "@/lib/client/types";

type NavLink = { href: string; label: string };

export const ADMIN_LINKS: NavLink[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/stages", label: "Stages & Vehicles" },
  { href: "/admin/users", label: "Manage Users" },
];

export const MAT_ADMIN_LINKS: NavLink[] = [
  { href: "/mat-admin", label: "Dashboard" },
  { href: "/mat-admin/vehicles", label: "My Vehicles" },
];

/** Header for the Admin and Matatu-admin dashboards (logo, nav, user menu with logout). */
export function DashboardHeader({
  links,
  active,
  profile,
  fallbackName,
}: {
  links: NavLink[];
  active: string;
  profile: Profile | null;
  fallbackName: string;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  const firstName = profile?.name.split(" ")[0] ?? fallbackName;

  return (
    <header className="site-header">
      <div className="header-container">
        <Link href={links[0]!.href} className="logo">
          MatConnect
        </Link>
        <nav className={`main-nav${navOpen ? " is-active" : ""}`}>
          <ul>
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={l.href === active ? "active" : undefined}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/profile">Profile</Link>
            </li>
            <li>
              <a href="#" className="logout-link" onClick={(e) => (e.preventDefault(), void logout())}>
                Logout
              </a>
            </li>
          </ul>
        </nav>
        <div className="header-actions">
          <div className={`user-menu${menuOpen ? " is-active" : ""}`} ref={menuRef}>
            <button className="user-menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
              {/* eslint-disable-next-line @next/next/no-img-element -- avatar may be a Google URL */}
              <img
                alt="User Avatar"
                className="avatar"
                src={profile?.profilePictureUrl || DEFAULT_AVATAR}
                referrerPolicy="no-referrer"
              />
              <span className="user-name">{firstName}</span>
              <Icon name="expand_more" className="dropdown-icon" />
            </button>
            <div className="user-menu-dropdown">
              <Link href="/profile">Profile</Link>
              <a href="#" onClick={(e) => (e.preventDefault(), void logout())}>
                Logout
              </a>
            </div>
          </div>
          <button className="mobile-menu-btn" aria-label="Menu" onClick={() => setNavOpen((o) => !o)}>
            <Icon name="menu" />
          </button>
        </div>
      </div>
    </header>
  );
}
