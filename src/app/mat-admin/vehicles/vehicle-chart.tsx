"use client";

import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip, type ChartData } from "chart.js";
import { useEffect, useRef, useState } from "react";
import { Bar } from "react-chartjs-2";
import { Icon } from "@/components/icon";
import { api } from "@/lib/client/api";
import type { ChartData as ApiChartData, Period } from "@/lib/client/types";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

/** Aligns distance and trips on the union of their period labels (they can differ). */
export function toChartData(data: ApiChartData): ChartData<"bar"> {
  const labels = [...new Set([...data.distance, ...data.trips].map((p) => p.period))].sort();
  const valueAt = (series: ApiChartData["distance"], label: string) => series.find((p) => p.period === label)?.total ?? 0;
  return {
    labels,
    datasets: [
      {
        label: "Distance (km)",
        data: labels.map((l) => valueAt(data.distance, l)),
        backgroundColor: "rgba(74, 108, 247, 0.6)",
        borderColor: "rgba(74, 108, 247, 1)",
        borderWidth: 1,
        yAxisID: "yDistance",
      },
      {
        label: "Trips",
        data: labels.map((l) => valueAt(data.trips, l)),
        backgroundColor: "rgba(56, 161, 105, 0.6)",
        borderColor: "rgba(56, 161, 105, 1)",
        borderWidth: 1,
        yAxisID: "yTrips",
      },
    ],
  };
}

export function VehicleChart({ vehicleId }: { vehicleId: number }) {
  const [period, setPeriod] = useState<Period>("daily");
  const [data, setData] = useState<ChartData<"bar"> | null>(null);
  const [error, setError] = useState(false);
  const chartRef = useRef<ChartJS<"bar"> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<ApiChartData>(`/api/mat-admin/vehicles/${vehicleId}/chart-data?period=${period}`, { signal: controller.signal })
      .then((d) => {
        setData(toChartData(d));
        setError(false);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(true);
        void e;
      });
    return () => controller.abort();
  }, [vehicleId, period]);

  function exportPng() {
    const chart = chartRef.current;
    if (!chart) return;
    const a = document.createElement("a");
    a.href = chart.toBase64Image();
    a.download = `chart_vehicle_${vehicleId}_${period}_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }

  return (
    <div className="charts-section">
      <h4>Performance Charts</h4>
      <div className="chart-controls">
        <div className="chart-period-filters">
          {PERIOD_OPTIONS.map((p) => (
            <button key={p.value} className={p.value === period ? "active" : undefined} onClick={() => setPeriod(p.value)}>
              {p.label}
            </button>
          ))}
        </div>
        <button className="btn btn-outline export-chart-btn" onClick={exportPng} disabled={!data}>
          <Icon name="download" /> Export
        </button>
      </div>
      <div className="chart-container">
        {error ? (
          <p>Could not load chart data.</p>
        ) : data ? (
          <Bar
            ref={chartRef}
            data={data}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                yDistance: { type: "linear", position: "left", title: { display: true, text: "Distance (km)" } },
                yTrips: {
                  type: "linear",
                  position: "right",
                  title: { display: true, text: "Trips" },
                  grid: { drawOnChartArea: false },
                },
              },
            }}
          />
        ) : (
          <p>Loading chart…</p>
        )}
      </div>
    </div>
  );
}
