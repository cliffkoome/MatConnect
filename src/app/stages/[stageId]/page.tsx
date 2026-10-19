"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import "@/styles/pages/stage-info.css";
import { Icon } from "@/components/icon";
import { api, errorMessage, logout } from "@/lib/client/api";
import { DEFAULT_AVATAR, usePolling, useProfile, useRoleGuard } from "@/lib/client/hooks";
import type { Arrival, StageEta } from "@/lib/client/types";

const ETA_REFRESH_MS = 30_000;
const statusClass = (status: Arrival["status"]) => `status-${status.toLowerCase().replaceAll(" ", "-")}`;

export default function StageInfoPage() {
  const { stageId } = useParams<{ stageId: string }>();
  const ready = useRoleGuard("Passenger");
  const profile = useProfile(ready);

  const [data, setData] = useState<StageEta | null>(null);
  const [error, setError] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadEtas = useCallback(async () => {
    try {
      setData(await api<StageEta>(`/api/eta/${stageId}`));
      setError(false);
    } catch {
      setError(true);
    }
  }, [stageId]);

  usePolling(loadEtas, ETA_REFRESH_MS, ready);

  useEffect(() => {
    if (!ready) return;
    api<{ isSubscribed: boolean }>(`/api/stages/${stageId}/subscription`)
      .then((r) => setSubscribed(r.isSubscribed))
      .catch(() => undefined);
  }, [ready, stageId]);

  async function toggleSubscription() {
    setToggling(true);
    try {
      const result = await api<{ message: string }>(
        `/api/stages/${stageId}/${subscribed ? "unsubscribe" : "subscribe"}`,
        { method: "POST" },
      );
      setSubscribed(!subscribed);
      setNotice(result.message);
    } catch (err) {
      setNotice(`Error: ${errorMessage(err)}`);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="page-stage-info dark">
      <title>{`${data?.stageName ?? "Stage"} · MatConnect`}</title>
      <div className="page-wrapper">
        <header className="site-header">
          <nav className="container navbar">
            <div className="logo">
              <h1>MatConnect</h1>
            </div>
            <div className="main-nav">
              <Link href="/stages" className="active">
                Stages
              </Link>
              <Link href="/feedback">Feedback</Link>
              <a href="#" onClick={(e) => (e.preventDefault(), void logout())}>
                Logout
              </a>
            </div>
            <div className="header-actions">
              <button
                className={`icon-button${subscribed ? " active" : ""}`}
                disabled={toggling}
                onClick={toggleSubscription}
                title={
                  subscribed
                    ? "SMS alerts are ON for the next arrival. Click to turn off."
                    : "SMS alerts are OFF. Click to get an alert for the next arrival."
                }
              >
                <Icon name={subscribed ? "notifications_active" : "notifications_off"} />
              </button>
              <button className="icon-button primary-btn btn-2" title="Logout" onClick={() => void logout()}>
                <Icon name="logout" />
              </button>
              <Link href="/profile" title="Your profile">
                {/* eslint-disable-next-line @next/next/no-img-element -- avatar may be a Google URL */}
                <img
                  alt="User Avatar"
                  className="avatar profile-icon"
                  src={profile?.profilePictureUrl || DEFAULT_AVATAR}
                  referrerPolicy="no-referrer"
                />
              </Link>
            </div>
          </nav>
        </header>

        <main className="container">
          <div className="page-header">
            <h2>{data?.stageName ?? "Loading…"}</h2>
            <p>Real-time arrivals for your next ride.</p>
            {notice && (
              <p role="status" style={{ marginTop: "0.5rem" }}>
                {notice}
              </p>
            )}
          </div>

          <div className="card arrival-card">
            <div className="card-header">
              <h3>Upcoming Matatus</h3>
            </div>
            <ul className="arrival-list">
              {error ? (
                <li className="error-message">Could not load arrival times. Please try again later.</li>
              ) : !data ? (
                <li className="arrival-item">
                  <p>Loading arrival times...</p>
                </li>
              ) : data.arrivals.length === 0 ? (
                <li className="arrival-item">
                  <p>No matatus are approaching this stage right now.</p>
                </li>
              ) : (
                data.arrivals.map((vehicle) => (
                  <li className="arrival-item" key={vehicle.id}>
                    <div className="vehicle-info">
                      <div className="vehicle-icon-wrapper">
                        <Icon name="directions_bus" />
                      </div>
                      <div>
                        <p className="plate-number">{vehicle.plateNumber}</p>
                        <p className="eta">ETA: {vehicle.eta}</p>
                      </div>
                    </div>
                    <div className="status-wrapper">
                      <span className={`status-badge ${statusClass(vehicle.status)}`}>
                        <span className="status-dot" />
                        {vehicle.status}
                      </span>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </main>

        <footer className="site-footer">
          <div className="container">
            <p>© {new Date().getFullYear()} MatConnect. All rights reserved.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
