"use client";

import { Fragment, useEffect, useState, type FormEvent } from "react";
import "@/styles/pages/feedback.css";
import { PassengerHeader } from "@/components/passenger-header";
import { api, errorMessage } from "@/lib/client/api";
import { useProfile, useRoleGuard } from "@/lib/client/hooks";

type VehicleOption = { id: number; plateNumber: string };

export default function FeedbackPage() {
  const ready = useRoleGuard("Passenger");
  const profile = useProfile(ready);
  const [vehicles, setVehicles] = useState<VehicleOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!ready) return;
    api<VehicleOption[]>("/api/feedback/vehicles")
      .then(setVehicles)
      .catch(() => setLoadError(true));
  }, [ready]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vehicleId) return setNotice({ text: "Please select a vehicle.", ok: false });
    if (!rating) return setNotice({ text: "Please provide a star rating.", ok: false });
    setBusy(true);
    try {
      const res = await api<{ message: string }>("/api/feedback", {
        method: "POST",
        body: { vehicleId: Number(vehicleId), rating, comment },
      });
      setNotice({ text: res.message, ok: true });
      setVehicleId("");
      setRating(0);
      setComment("");
    } catch (error) {
      setNotice({ text: `Error submitting feedback: ${errorMessage(error)}`, ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-feedback">
      <title>Feedback · MatConnect</title>
      <div className="page-wrapper">
        <PassengerHeader active="feedback" avatarUrl={profile?.profilePictureUrl} containerClassName="container header-content" />

        <main className="main-content">
          <div className="feedback-card">
            <div className="card-header">
              <h2>Your Feedback Matters</h2>
              <p>Help us improve your matatu experience. Share your thoughts on your recent ride.</p>
            </div>
            <form className="feedback-form" onSubmit={onSubmit}>
              <div className="form-group">
                <label htmlFor="vehicle-select">Select Vehicle</label>
                <select
                  id="vehicle-select"
                  className="form-select"
                  required
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                >
                  <option value="" disabled>
                    {loadError
                      ? "Could not load vehicles."
                      : !vehicles
                        ? "Loading vehicles..."
                        : vehicles.length
                          ? "Select a vehicle..."
                          : "No vehicles available for feedback."}
                  </option>
                  {vehicles?.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Rate Your Experience</label>
                {/* Visual order 1→5 comes from `flex-direction: row-reverse` in the stylesheet. */}
                <fieldset className="rating-stars">
                  {[5, 4, 3, 2, 1].map((value) => (
                    // Inputs and labels must stay direct siblings for the stylesheet's `label:hover ~ label`.
                    <Fragment key={value}>
                      <input
                        type="radio"
                        id={`star${value}`}
                        name="rating"
                        value={value}
                        checked={rating === value}
                        onChange={() => setRating(value)}
                      />
                      <label
                        htmlFor={`star${value}`}
                        className={value <= rating ? "is-selected" : undefined}
                        title={`${value} star${value > 1 ? "s" : ""}`}
                      >
                        star
                      </label>
                    </Fragment>
                  ))}
                </fieldset>
              </div>
              <div className="form-group">
                <label htmlFor="comments">Your Comments</label>
                <textarea
                  id="comments"
                  className="form-textarea"
                  placeholder="Tell us more about what you liked or what could be better..."
                  rows={4}
                  maxLength={2000}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>
              {notice && (
                <p role="status" style={{ color: notice.ok ? "#15803d" : "#dc2626", margin: 0 }}>
                  {notice.text}
                </p>
              )}
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Submitting…" : "Submit Feedback"}
              </button>
            </form>
          </div>
        </main>

        <footer className="site-footer">
          <p>© {new Date().getFullYear()} MatConnect. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}
