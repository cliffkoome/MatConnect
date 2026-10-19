"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import "@/styles/pages/mat-admin.css";
import { DashboardHeader, MAT_ADMIN_LINKS } from "@/components/dashboard-header";
import { Icon } from "@/components/icon";
import { LiveVehicleTable } from "@/components/live-vehicle-table";
import { api } from "@/lib/client/api";
import { usePolling, useProfile, useRoleGuard } from "@/lib/client/hooks";
import type { DashboardSummary, LiveVehicleRow } from "@/lib/client/types";

const LIVE_REFRESH_MS = 30_000;

export default function MatAdminDashboardPage() {
  const ready = useRoleGuard("MatAdmin");
  const profile = useProfile(ready);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [vehicles, setVehicles] = useState<LiveVehicleRow[] | null>(null);
  const [vehiclesError, setVehiclesError] = useState(false);

  useEffect(() => {
    if (!ready) return;
    api<DashboardSummary>("/api/mat-admin/dashboard-summary")
      .then(setSummary)
      .catch(() => setSummaryError(true));
  }, [ready]);

  const loadLive = useCallback(async () => {
    try {
      setVehicles((await api<{ vehicles: LiveVehicleRow[] }>("/api/mat-admin/dashboard-data")).vehicles);
      setVehiclesError(false);
    } catch {
      setVehiclesError(true);
    }
  }, []);
  usePolling(loadLive, LIVE_REFRESH_MS, ready);

  const show = (value: string | number | undefined) => (summaryError ? "Error" : (value ?? "--"));

  return (
    <div className="page-mat-admin">
      <title>Matatu Admin Dashboard · MatConnect</title>
      <div className="page-wrapper">
        <DashboardHeader links={MAT_ADMIN_LINKS} active="/mat-admin" profile={profile} fallbackName="Matatu Admin" />

        <main className="dashboard-container">
          <header className="dashboard-header">
            <h1>My Dashboard</h1>
            <p>Welcome back! Here&apos;s an overview of your fleet&apos;s performance today.</p>
          </header>

          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon-wrapper icon-blue">
                <Icon name="directions_bus" />
              </div>
              <div className="stat-info">
                <p>My Vehicles</p>
                <span>{show(summary?.totalVehicles)}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrapper icon-purple">
                <Icon name="social_distance" />
              </div>
              <div className="stat-info">
                <p>Total Distance Today</p>
                <span>{show(summary ? `${(summary.totalDistanceToday / 1000).toFixed(2)} km` : undefined)}</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrapper icon-green">
                <Icon name="trip_origin" />
              </div>
              <div className="stat-info">
                <p>Total Trips Today</p>
                <span>{show(summary?.totalTripsToday)}</span>
              </div>
            </div>
          </section>

          <div className="dashboard-grid-full">
            <section className="grid-main">
              <div className="panel">
                <div className="card-header">
                  <h3>Live Vehicle Status</h3>
                  <Link href="/mat-admin/vehicles" className="btn">
                    View All Stats
                  </Link>
                </div>
                <LiveVehicleTable vehicles={vehicles} error={vehiclesError} showRoute={false} />
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
