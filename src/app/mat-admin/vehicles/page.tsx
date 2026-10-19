"use client";

import { useEffect, useState } from "react";
import "@/styles/pages/mat-admin-vehicles.css";
import { DashboardHeader, MAT_ADMIN_LINKS } from "@/components/dashboard-header";
import { Icon } from "@/components/icon";
import { api, errorMessage } from "@/lib/client/api";
import { useProfile, useRoleGuard } from "@/lib/client/hooks";
import { fleetReportCsv } from "@/lib/client/csv";
import type { Period, VehicleStats } from "@/lib/client/types";
import { PERIOD_OPTIONS, VehicleChart } from "./vehicle-chart";

const todayUtc = () => new Date().toISOString().slice(0, 10);

export default function MatAdminVehiclesPage() {
  const ready = useRoleGuard("MatAdmin");
  const profile = useProfile(ready);
  const [date, setDate] = useState(todayUtc);
  const [loaded, setLoaded] = useState<{ date: string; vehicles: VehicleStats[] } | null>(null);
  const [error, setError] = useState(false);
  const vehicles = loaded?.date === date ? loaded.vehicles : null;
  const [reportPeriod, setReportPeriod] = useState<Period>("daily");

  useEffect(() => {
    if (!ready) return;
    api<VehicleStats[]>(`/api/mat-admin/vehicle-stats?date=${date}`)
      .then((v) => {
        setLoaded({ date, vehicles: v });
        setError(false);
      })
      .catch(() => setError(true));
  }, [ready, date]);

  async function exportFleetReport() {
    try {
      const data = await api<Record<string, { distance: number; trips: number }>>(
        `/api/mat-admin/fleet-aggregate-data?period=${reportPeriod}`,
      );
      if (Object.keys(data).length === 0) return alert("No data available to export for the selected period.");
      const blob = new Blob([fleetReportCsv(data)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fleet_report_${reportPeriod}_${todayUtc()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Failed to generate the report: ${errorMessage(err)}`);
    }
  }

  return (
    <div className="page-mat-admin-vehicles">
      <title>My Vehicles · MatConnect</title>
      <div className="page-wrapper">
        <DashboardHeader links={MAT_ADMIN_LINKS} active="/mat-admin/vehicles" profile={profile} fallbackName="Matatu Admin" />

        <main className="dashboard-container">
          <header className="dashboard-header">
            <h1>My Vehicles</h1>
            <p>Detailed statistics and feedback for your fleet.</p>
          </header>

          <div className="controls-bar">
            <div className="date-filter">
              <label htmlFor="stats-date">Showing stats for:</label>
              <input type="date" id="stats-date" value={date} max={todayUtc()} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </div>
            <div className="fleet-report-section">
              <div className="chart-period-filters">
                {PERIOD_OPTIONS.map((p) => (
                  <button key={p.value} className={p.value === reportPeriod ? "active" : undefined} onClick={() => setReportPeriod(p.value)}>
                    {p.label}
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" onClick={exportFleetReport}>
                <Icon name="download" /> Export Fleet Report
              </button>
            </div>
          </div>

          <section id="vehicle-stats-container">
            {error ? (
              <div className="loading-placeholder error-message">
                <p>Could not load vehicle statistics.</p>
              </div>
            ) : !vehicles ? (
              <div className="loading-placeholder">
                <p>Loading vehicle stats...</p>
              </div>
            ) : vehicles.length === 0 ? (
              <div className="loading-placeholder">
                <p>You have not added any vehicles yet.</p>
              </div>
            ) : (
              vehicles.map((vehicle) => (
                <div className="vehicle-card panel" key={vehicle.id}>
                  <div className="card-header">
                    <h3>{vehicle.plateNumber}</h3>
                    <span className="vehicle-id">ID: {vehicle.carId}</span>
                  </div>
                  <div className="vehicle-stats-grid">
                    <div className="mini-stat">
                      <h4>Distance{date === todayUtc() ? " Today" : ` on ${date}`}</h4>
                      <p>{vehicle.distanceKm.toFixed(2)} km</p>
                    </div>
                    <div className="mini-stat">
                      <h4>Trips{date === todayUtc() ? " Today" : ` on ${date}`}</h4>
                      <p>{vehicle.trips}</p>
                    </div>
                  </div>
                  <div className="feedback-section">
                    <h4>Recent Feedback</h4>
                    {vehicle.recentFeedback.length === 0 ? (
                      <p>No feedback for this vehicle yet.</p>
                    ) : (
                      vehicle.recentFeedback.map((fb) => (
                        <div className="feedback-item" key={fb.id}>
                          <p>
                            <strong>
                              {fb.user.name} ({fb.rating}★):
                            </strong>{" "}
                            {fb.comment || "No comment"}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  <VehicleChart vehicleId={vehicle.id} />
                </div>
              ))
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
