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

  // 2FA modal state
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [code, setCode] = useState("");

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

  async function toggleTwoFactor() {
    if (!profile) return;
    try {
      if (profile.twoFactorEnabled) {
        if (!confirm("Are you sure you want to disable Two-Factor Authentication?")) return;
        await api("/api/auth/2fa/disable", { method: "POST" });
        setProfile({ ...profile, twoFactorEnabled: false });
        setNotice({ text: "2FA has been disabled.", ok: true });
      } else {
        const data = await api<{ qrCodeUrl: string }>("/api/auth/2fa/setup", { method: "POST" });
        setQrCode(data.qrCodeUrl);
      }
    } catch (error) {
      setNotice({ text: `Error: ${errorMessage(error)}`, ok: false });
    }
  }

  async function verifyTwoFactor() {
    if (!/^\d{6}$/.test(code)) return alert("Please enter a valid 6-digit code.");
    try {
      await api("/api/auth/2fa/verify", { method: "POST", body: { token: code } });
      setProfile((p) => (p ? { ...p, twoFactorEnabled: true } : p));
      setNotice({ text: "2FA enabled successfully!", ok: true });
      closeModal();
    } catch (error) {
      alert(`Verification failed: ${errorMessage(error)}`);
    }
  }

  const closeModal = () => {
    setQrCode(null);
    setCode("");
  };

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

            {profile && !profile.isGoogleUser && (
              <>
                <hr className="divider" />
                <div className="two-factor-section">
                  <h3>Two-Factor Authentication (2FA)</h3>
                  <div className="two-factor-content">
                    <div className="form-group">
                      <p>
                        Status:{" "}
                        <span className={`status-badge ${profile.twoFactorEnabled ? "enabled" : "disabled"}`}>
                          {profile.twoFactorEnabled ? "Enabled" : "Disabled"}
                        </span>
                      </p>
                      <p className="description">
                        Add an extra layer of security to your account by requiring a second verification step when
                        you sign in.
                      </p>
                    </div>
                    <div className="form-group">
                      <button className="btn btn-secondary" onClick={toggleTwoFactor}>
                        {profile.twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
                      </button>
                    </div>
                  </div>
                </div>

                <hr className="divider" />
                <div className="password-reset-section">
                  <h3>Password Reset</h3>
                  <p className="description" style={{ marginBottom: "1rem" }}>
                    To change your password, use the &quot;Forgot Password&quot; flow.
                  </p>
                  <Link href="/forgot-password" className="btn btn-secondary">
                    Go to Password Reset
                  </Link>
                </div>
              </>
            )}
          </div>
        </main>

        {qrCode && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
            <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="twofa-title">
              <header className="modal-header">
                <h3 id="twofa-title">Set Up Two-Factor Authentication</h3>
                <button className="icon-button" onClick={closeModal} aria-label="Close">
                  <Icon name="close" />
                </button>
              </header>
              <div className="modal-body">
                <p>
                  Scan the QR code below with your authenticator app (like Google Authenticator or Authy), then enter
                  the 6-digit code to verify.
                </p>
                <div className="qr-code-container">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data: URL */}
                  <img src={qrCode} alt="QR Code for 2FA" />
                </div>
                <div className="form-group">
                  <label htmlFor="twofa-verify-token">Verification Code</label>
                  <input
                    type="text"
                    id="twofa-verify-token"
                    className="form-input"
                    placeholder="Enter 6-digit code"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>
              <footer className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={verifyTwoFactor}>
                  Verify &amp; Enable
                </button>
              </footer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
