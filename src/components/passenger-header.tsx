"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { logout } from "@/lib/client/api";
import { DEFAULT_AVATAR } from "@/lib/client/hooks";

type Props = {
  active: "stages" | "feedback" | "profile";
  avatarUrl?: string | null;
  /** The two legacy pages used different container class names; their CSS targets these. */
  containerClassName?: string;
};

const links = [
  { key: "stages", href: "/stages", label: "Stages" },
  { key: "feedback", href: "/feedback", label: "Feedback" },
] as const;

/** Header shared by the passenger pages (stage list, feedback). */
export function PassengerHeader({ active, avatarUrl, containerClassName = "container nav-container" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className={containerClassName}>
        <Link className="logo" href="/">
          MatConnect
        </Link>
        <nav className={`main-nav${open ? " is-active" : ""}`}>
          <ul>
            {links.map((l) => (
              <li key={l.key}>
                <Link href={l.href} className={active === l.key ? "active" : undefined}>
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <a href="#" className="logout-link" onClick={(e) => (e.preventDefault(), void logout())}>
                Logout
              </a>
            </li>
          </ul>
        </nav>
        <div className="header-actions">
          <button className="logout-btn-desktop" title="Logout" onClick={() => void logout()}>
            <Icon name="logout" />
          </button>
          <div className="user-profile">
            <Link href="/profile" title="Your profile">
              {/* eslint-disable-next-line @next/next/no-img-element -- avatar may be a Google URL */}
              <img
                alt="User profile picture"
                className="profile-icon"
                src={avatarUrl || DEFAULT_AVATAR}
                referrerPolicy="no-referrer"
              />
            </Link>
          </div>
          <button className="mobile-menu-btn" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <Icon name="menu" />
          </button>
        </div>
      </div>
    </header>
  );
}
