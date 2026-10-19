"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import "@/styles/pages/admin.css";
import { ADMIN_LINKS, DashboardHeader } from "@/components/dashboard-header";
import { Icon } from "@/components/icon";
import { LiveVehicleTable } from "@/components/live-vehicle-table";
import { api } from "@/lib/client/api";
import { usePolling, useProfile, useRoleGuard } from "@/lib/client/hooks";
import type { FeedbackItem, LiveVehicleRow, Page, Stage } from "@/lib/client/types";

const REFRESH_MS = 60_000;

export default function AdminDashboardPage() {
  const ready = useRoleGuard("Admin");
  const profile = useProfile(ready);
  const [vehicles, setVehicles] = useState<LiveVehicleRow[] | null>(null);
  const [vehiclesError, setVehiclesError] = useState(false);
  const [stageCount, setStageCount] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[] | null>(null);
  const [feedbackError, setFeedbackError] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const [data, stages] = await Promise.all([
        api<{ vehicles: LiveVehicleRow[] }>("/api/admin/dashboard-data"),
        api<Stage[]>("/api/stages"),
      ]);
      setVehicles(data.vehicles);
      setStageCount(stages.length);
      setVehiclesError(false);
    } catch {
      setVehiclesError(true);
    }
  }, []);

  usePolling(loadDashboard, REFRESH_MS, ready);

  useEffect(() => {
    if (!ready) return;
    api<Page<"feedback", FeedbackItem>>("/api/admin/feedback?limit=10")
      .then((r) => setFeedback(r.feedback))
      .catch(() => setFeedbackError(true));
  }, [ready]);

  const online = vehicles?.filter((v) => v.status === "Online").length;

  return (
    <div className="page-admin">
      <title>Admin Dashboard · MatConnect</title>
      <div className="page-wrapper">
        <DashboardHeader links={ADMIN_LINKS} active="/admin" profile={profile} fallbackName="Admin" />

        <main className="dashboard-container">
          <header className="dashboard-header">
            <h1>Admin Dashboard</h1>
            <p>Welcome back! Here&apos;s an overview of the system.</p>
          </header>

          <section className="stats-grid">
            <Stat icon="directions_bus" tone="icon-blue" label="Total Vehicles" value={vehicles?.length} />
            <Stat icon="signal_cellular_alt" tone="icon-green" label="Online Vehicles" value={online} />
            <Stat icon="pin_drop" tone="icon-orange" label="Configured Stages" value={stageCount ?? undefined} />
          </section>

          <div className="dashboard-grid">
            <section className="grid-main">
              <div className="panel">
                <div className="card-header">
                  <h3>Live Vehicle Status</h3>
                  <Link href="/admin/stages" className="btn">
                    Manage
                  </Link>
                </div>
                <LiveVehicleTable vehicles={vehicles} error={vehiclesError} />
              </div>
            </section>

            <aside className="grid-sidebar">
              <div className="panel">
                <h3>Recent Feedback</h3>
                <div id="feedback-list">
                  {feedbackError ? (
                    <p className="error-message">Could not load feedback.</p>
                  ) : !feedback ? (
                    <p className="loading-text">Loading feedback...</p>
                  ) : feedback.length === 0 ? (
                    <p>No recent feedback.</p>
                  ) : (
                    feedback.map((item) => (
                      <div className="feedback-item" key={item.id}>
                        <div className="feedback-body">
                          <div className="feedback-meta">
                            <p>
                              {item.user.name} on <strong>{item.vehicle.plateNumber}</strong>
                            </p>
                            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString()}</time>
                          </div>
                          <div className="star-rating" aria-label={`${item.rating} out of 5`}>
                            {Array.from({ length: 5 }, (_, i) => (
                              <Icon key={i} name="star" className={i < item.rating ? undefined : "star-empty"} />
                            ))}
                          </div>
                          <p className="feedback-comment">{item.comment || "No comment provided."}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

function Stat({ icon, tone, label, value }: { icon: string; tone: string; label: string; value?: number }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon-wrapper ${tone}`}>
        <Icon name={icon} />
      </div>
      <div className="stat-info">
        <p>{label}</p>
        <span>{value ?? "--"}</span>
      </div>
    </div>
  );
}
