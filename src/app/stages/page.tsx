"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "@/styles/pages/stages.css";
import { PassengerHeader } from "@/components/passenger-header";
import { api } from "@/lib/client/api";
import { useProfile, useRoleGuard } from "@/lib/client/hooks";
import type { Stage } from "@/lib/client/types";

/** Stable placeholder image per stage (the old page picked one at random on every render). */
const stageImage = (id: number) => `/images/stage-${(id % 6) + 1}.jpg`;

export default function SelectStagePage() {
  const ready = useRoleGuard(["Passenger", "Admin"]);
  const profile = useProfile(ready);
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ready) return;
    api<Stage[]>("/api/stages")
      .then(setStages)
      .catch(() => setError(true));
  }, [ready]);

  return (
    <div className="page-stages">
      <title>Select Stage · MatConnect</title>
      <PassengerHeader active="stages" avatarUrl={profile?.profilePictureUrl} />
      <main className="container">
        <section className="stage-selector">
          <h1 className="main-title">Select Your Stage</h1>
          <div className="stage-grid">
            {error ? (
              <p className="error-message">Could not load stages. Please try again later.</p>
            ) : !stages ? (
              <p>Loading stages...</p>
            ) : stages.length === 0 ? (
              <p>No stages are available at the moment.</p>
            ) : (
              stages.map((stage) => (
                <Link key={stage.id} className="stage-card" href={`/stages/${stage.id}`}>
                  <div className="card-image">
                    {/* eslint-disable-next-line @next/next/no-img-element -- decorative placeholder */}
                    <img alt={stage.name} src={stageImage(stage.id)} />
                    <div className="overlay" />
                  </div>
                  <div className="card-content">
                    <h3>{stage.name}</h3>
                    <p>
                      Lat: {stage.latitude}, Long: {stage.longitude}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
