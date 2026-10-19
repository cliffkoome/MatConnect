"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { api, logout } from "@/lib/client/api";
import { clearSession, getSession, homePathFor } from "@/lib/client/session";
import type { Profile, Role } from "@/lib/client/types";

const features = [
  {
    icon: "schedule",
    title: "Real-Time ETA",
    text: "Get accurate estimated arrival times for your matatu, updated in real-time based on current traffic and route conditions.",
  },
  {
    icon: "map",
    title: "Stage Information",
    text: "Access detailed information about matatu stages, including routes, stops, and available services.",
  },
  {
    icon: "notifications",
    title: "Reliable Updates",
    text: "Receive timely notifications and updates about your matatu's progress, ensuring you're always informed.",
  },
];

export function HomeClient() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    api<Profile>("/api/auth/me", { redirectOnAuthFailure: false })
      .then((me) => setRole(me.role))
      .catch(() => clearSession());
  }, []);

  return (
    <div className="page-home">
      <header className="site-header">
        <div className="container nav-container">
          <Link className="logo" href="/">
            MatConnect
          </Link>
          <nav className={`main-nav${menuOpen ? " is-active" : ""}`}>
            <ul className="nav-links">
              <li>
                <a href="#features">About</a>
              </li>
              <li>
                <a href="mailto:support@matconnect.app">Contact</a>
              </li>
              {role && (
                <li>
                  <a href="#" className="logout" onClick={(e) => (e.preventDefault(), void logout())}>
                    Logout
                  </a>
                </li>
              )}
            </ul>
          </nav>
          <div className="header-buttons">
            {role ? (
              <button className="logout primary-btn btn-2" title="Logout" onClick={() => void logout()}>
                <Icon name="logout" />
              </button>
            ) : (
              <>
                <button className="primary-btn btn-2 login" onClick={() => router.push("/login")}>
                  Login
                </button>
                <button className="primary-btn btn-1 signup" onClick={() => router.push("/signup")}>
                  Sign Up
                </button>
              </>
            )}
          </div>
          <button className="mobile-menu-btn" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>
            <Icon name="menu" />
          </button>
        </div>
      </header>

      <main className="main-section">
        <section className="hero-section">
          <h1 className="hero-msg">Know when your matatu is arriving in real-time.</h1>
          <p className="hero-desc">
            MatConnect provides real-time arrival information for matatus, helping you plan your commute efficiently
            and avoid unnecessary waiting.
          </p>
          <div className="hero-btns">
            {role ? (
              <button className="dashboard primary-btn btn-1" onClick={() => router.push(homePathFor(role))}>
                {role === "Passenger" ? "Select a Stage" : "Go to Dashboard"}
              </button>
            ) : (
              <>
                <button className="primary-btn btn-1 hero-btn login" onClick={() => router.push("/login")}>
                  Login
                </button>
                <button className="primary-btn btn-2 hero-btn signup" onClick={() => router.push("/signup")}>
                  Sign Up
                </button>
              </>
            )}
          </div>
        </section>

        <section className="features" id="features">
          <div className="features-info">
            <h1 className="card-title">Features</h1>
            <p className="card-desc">Everything you need for a stress-free commute.</p>
          </div>
          <div className="features-cards">
            {features.map((f) => (
              <div className="features-card" key={f.title}>
                <div className="card-logo">
                  <Icon name={f.icon} />
                </div>
                <div className="card-info">
                  <h2 className="card-title">{f.title}</h2>
                  <p className="card-desc">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-section footlogo">MatConnect</div>
        <div className="footer-section footlinks">
          <div className="footer-links">
            <a href="#features">About</a>
            <a href="mailto:support@matconnect.app">Contact</a>
            <a href="#">Privacy Policy</a>
          </div>
        </div>
        <div className="footer-section copyright">&copy; {new Date().getFullYear()} MatConnect. All rights reserved</div>
      </footer>
    </div>
  );
}
