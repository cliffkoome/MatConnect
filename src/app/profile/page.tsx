"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import "@/styles/pages/profile.css";
import { Icon } from "@/components/icon";
import { api, errorMessage, logout } from "@/lib/client/api";
import { DEFAULT_AVATAR, useRoleGuard } from "@/lib/client/hooks";
import type { Profile } from "@/lib/client/types";

export default function ProfilePage() {
  const ready = useRoleGuard(["Passenger", "Admin", "MatAdmin"]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ready) return;
    api<Profile>("/api/auth/me")
      .then((p) => {
        setProfile(p);
        setName(p.name);
        setPhone(p.phoneNumber ?? "");
      })
      .catch((e) => setNotice({ text: `Could not load your profile: ${errorMessage(e)}`, ok: false }));
  }, [ready]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/auth/me", { method: "PUT", body: { name, phoneNumber: phone.trim() || null } });
      const fresh = await api<Profile>("/api/auth/me");
      setProfile(fresh);
      setPhone(fresh.phoneNumber ?? "");
      setNotice({ text: "Profile updated successfully!", ok: true });
    } catch (error) {
      setNotice({ text: `Error: ${errorMessage(error)}`, ok: false });
    } finally {
      setSaving(false);
    }
  }

  const avatar = profile?.profilePictureUrl || DEFAULT_AVATAR;
  const home = profile?.role === "Admin" ? "/admin" : profile?.role === "MatAdmin" ? "/mat-admin" : "/stages";

  return (
    <div className="page-profile">
      <title>Profile · MatConnect</title>
      <div className="page-wrapper">
        <header className="site-header">
          <div className="container">
            <div className="header-content">
              <div className="logo">
                <Link className="logo" href="/">
                  MatConnect
                </Link>
              </div>
              <nav className="main-nav">
                {profile?.role === "Passenger" || !profile ? (
                  <>
                    <Link href="/stages">Stages</Link>
                    <Link href="/feedback">Feedback</Link>
                  </>
                ) : (
                  <Link href={home}>Dashboard</Link>
                )}
                <Link href="/profile" className="active">
                  Profile
                </Link>
              </nav>
              <div className="header-actions">
                <button className="icon-button primary-btn btn-2" title="Logout" onClick={() => void logout()}>
                  <Icon name="logout" />
                </button>
                <div className="avatar" style={{ backgroundImage: `url(${avatar})` }} />
              </div>
            </div>
          </div>
        </header>

        <main className="container main-content">
          <div className="profile-card">
            <div className="card-header">
              <h2>Profile</h2>
              <p>Manage your personal details and preferences.</p>
              {notice && (
                <p role="status" style={{ color: notice.ok ? "#15803d" : "#dc2626" }}>
                  {notice.text}
                </p>
              )}
            </div>

            <div className="profile-details-section">
              <div className="profile-picture-container">
                <div className="profile-picture">
                  {/* eslint-disable-next-line @next/next/no-img-element -- avatar may be a Google URL */}
                  <img id="profile-img" alt="User profile picture" src={avatar} referrerPolicy="no-referrer" />
                </div>
              </div>
              <form className="form-grid" onSubmit={saveProfile}>
                <div className="form-group">
                  <label htmlFor="name">Name</label>
                  <input className="form-input" id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input className="form-input" id="email" type="email" value={profile?.email ?? ""} readOnly />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Phone Number</label>
                  <input
                    className="form-input"
                    id="phone"
                    type="tel"
                    placeholder="e.g. 0712 345 678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="form-actions">
                  <button className="btn btn-primary" type="submit" disabled={saving || !profile}>
                    {saving ? "Saving…" : "Update Information"}
                  </button>
                </div>
              </form>
            </div>

            <hr className="divider" />
            <div className="password-reset-section">
              <h3>Password</h3>
              <p className="description" style={{ marginBottom: "1rem" }}>
                To change your password, we&apos;ll email you a reset code. (If you only sign in with Google, this
                also lets you add a password.)
              </p>
              <Link href="/forgot-password" className="btn btn-secondary">
                Go to Password Reset
              </Link>
            </div>
          </div>
        </main>

      </div>
    </div>
  );
}
