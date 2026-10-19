"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import "@/styles/pages/admin-stages.css";
import { ADMIN_LINKS, DashboardHeader } from "@/components/dashboard-header";
import { Icon } from "@/components/icon";
import { api, errorMessage } from "@/lib/client/api";
import { useProfile, useRoleGuard } from "@/lib/client/hooks";
import type { Page, StageWithVehicles, VehicleSummary } from "@/lib/client/types";

type MatAdmin = { id: number; name: string };

export default function ManageStagesPage() {
  const ready = useRoleGuard("Admin");
  const profile = useProfile(ready);

  const [stages, setStages] = useState<StageWithVehicles[] | null>(null);
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [matAdmins, setMatAdmins] = useState<MatAdmin[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [assignId, setAssignId] = useState("");

  const [stageModal, setStageModal] = useState(false);
  const [stageForm, setStageForm] = useState({ name: "", latitude: "", longitude: "" });
  const [vehicleModal, setVehicleModal] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ plateNumber: "", carId: "", ownerId: "" });

  const load = useCallback(
    () =>
      Promise.all([
        api<Page<"stages", StageWithVehicles>>("/api/admin/stages?limit=100"),
        api<Page<"vehicles", VehicleSummary>>("/api/admin/vehicles?limit=100"),
        api<MatAdmin[]>("/api/admin/mat-admins"),
      ]).then(
        ([s, v, m]) => {
          setStages(s.stages);
          setVehicles(v.vehicles);
          setMatAdmins(m);
          setLoadError(null);
        },
        (err: unknown) => setLoadError(errorMessage(err)),
      ),
    [],
  );

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const selected = stages?.find((s) => s.id === selectedId) ?? null;
  const assignable = useMemo(() => {
    const assigned = new Set(selected?.vehicles.map((v) => v.id));
    return vehicles.filter((v) => !assigned.has(v.id));
  }, [selected, vehicles]);

  const patchStage = (id: number, update: (s: StageWithVehicles) => StageWithVehicles) =>
    setStages((list) => list?.map((s) => (s.id === id ? update(s) : s)) ?? null);

  async function addStage(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await api<StageWithVehicles>("/api/admin/stages", {
        method: "POST",
        body: { name: stageForm.name, latitude: Number(stageForm.latitude), longitude: Number(stageForm.longitude) },
      });
      setStages((list) => [...(list ?? []), created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedId(created.id);
      setStageModal(false);
      setStageForm({ name: "", latitude: "", longitude: "" });
    } catch (err) {
      alert(`Error creating stage: ${errorMessage(err)}`);
    }
  }

  async function addVehicle(e: FormEvent) {
    e.preventDefault();
    try {
      const created = await api<VehicleSummary>("/api/admin/vehicles", {
        method: "POST",
        body: {
          plateNumber: vehicleForm.plateNumber,
          carId: vehicleForm.carId,
          ownerId: vehicleForm.ownerId ? Number(vehicleForm.ownerId) : null,
        },
      });
      setVehicles((list) => [...list, created].sort((a, b) => a.plateNumber.localeCompare(b.plateNumber)));
      setVehicleModal(false);
      setVehicleForm({ plateNumber: "", carId: "", ownerId: "" });
    } catch (err) {
      alert(`Error creating vehicle: ${errorMessage(err)}`);
    }
  }

  async function assign() {
    if (!selected || !assignId) return;
    const vehicle = vehicles.find((v) => v.id === Number(assignId));
    try {
      await api("/api/admin/stages/assign-vehicle", {
        method: "POST",
        body: { stageId: selected.id, vehicleId: Number(assignId) },
      });
      if (vehicle) patchStage(selected.id, (s) => ({ ...s, vehicles: [...s.vehicles, vehicle] }));
      setAssignId("");
    } catch (err) {
      alert(`Error assigning vehicle: ${errorMessage(err)}`);
    }
  }

  async function unassign(vehicleId: number) {
    if (!selected) return;
    try {
      await api(`/api/admin/stages/${selected.id}/vehicles/${vehicleId}`, { method: "DELETE" });
      patchStage(selected.id, (s) => ({ ...s, vehicles: s.vehicles.filter((v) => v.id !== vehicleId) }));
    } catch (err) {
      alert(`Error removing vehicle: ${errorMessage(err)}`);
    }
  }

  async function deleteVehicle(vehicle: VehicleSummary) {
    if (!confirm(`Delete vehicle ${vehicle.plateNumber}? It will be removed from every stage.`)) return;
    try {
      await api(`/api/admin/vehicles/${vehicle.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      alert(`Error deleting vehicle: ${errorMessage(err)}`);
    }
  }

  return (
    <div className="page-admin-stages">
      <title>Manage Stages · MatConnect</title>
      <div className="page-wrapper">
        <DashboardHeader links={ADMIN_LINKS} active="/admin/stages" profile={profile} fallbackName="Admin" />

        <main className="dashboard-container">
          <section className="panel" id="stages-panel">
            <header className="panel-header">
              <h2>Stages</h2>
            </header>
            <div className="panel-body scrollable">
              <ul className="stage-list">
                {loadError ? (
                  <p className="error-message">Failed to load data: {loadError}</p>
                ) : !stages ? (
                  <p>Loading stages...</p>
                ) : stages.length === 0 ? (
                  <p>No stages found. Add one to get started.</p>
                ) : (
                  stages.map((stage) => (
                    <li
                      key={stage.id}
                      className={`stage-list-item${stage.id === selectedId ? " active" : ""}`}
                      onClick={() => setSelectedId(stage.id)}
                      onKeyDown={(e) => e.key === "Enter" && setSelectedId(stage.id)}
                      tabIndex={0}
                    >
                      <div className="item-icon">
                        <Icon name="flag" />
                      </div>
                      <p>{stage.name}</p>
                      <Icon name="chevron_right" className="chevron" />
                    </li>
                  ))
                )}
              </ul>
            </div>
            <footer className="panel-footer">
              <button className="btn btn-primary" onClick={() => setStageModal(true)}>
                <Icon name="add" />
                Add New Stage
              </button>
            </footer>
          </section>

          <section className="panel panel-details" id="details-panel">
            <header className="panel-header">
              <h2>{selected?.name ?? "Select a Stage"}</h2>
              <p className="sub-header">
                {selected ? (
                  <>
                    <Icon name="location_on" /> Lat: {selected.latitude}, Long: {selected.longitude}
                  </>
                ) : (
                  "Details will appear here."
                )}
              </p>
            </header>
            <div className="panel-body">
              <h3>Assigned Vehicles</h3>
              <ul className="vehicle-list">
                {!selected ? (
                  <p>Select a stage to see assigned vehicles.</p>
                ) : selected.vehicles.length === 0 ? (
                  <p>No vehicles assigned to this stage.</p>
                ) : (
                  selected.vehicles.map((vehicle) => (
                    <li className="vehicle-list-item" key={vehicle.id}>
                      <div className="vehicle-info">
                        <Icon name="local_shipping" />
                        <p>{vehicle.plateNumber}</p>
                      </div>
                      <div className="vehicle-actions">
                        <button className="icon-button unassign-btn" title="Unassign from stage" onClick={() => unassign(vehicle.id)}>
                          <Icon name="link_off" />
                        </button>
                        <button className="icon-button delete-btn" title="Delete vehicle" onClick={() => deleteVehicle(vehicle)}>
                          <Icon name="delete_forever" />
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <footer className={`panel-footer${selected ? "" : " hidden"}`}>
              <div className="assign-form">
                <select className="form-select" value={assignId} onChange={(e) => setAssignId(e.target.value)} aria-label="Vehicle to assign">
                  <option value="">Select a vehicle to assign...</option>
                  {assignable.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber}
                    </option>
                  ))}
                </select>
                <button className="btn btn-primary" onClick={assign} disabled={!assignId}>
                  <Icon name="link" />
                  Assign
                </button>
                <button className="btn btn-secondary" onClick={() => setVehicleModal(true)}>
                  <Icon name="add" />
                  New Vehicle
                </button>
              </div>
            </footer>
          </section>
        </main>
      </div>

      {vehicleModal && (
        <Modal title="Add New Vehicle" onClose={() => setVehicleModal(false)}>
          <form onSubmit={addVehicle}>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="vehicle-plate-input">Plate Number</label>
                <input
                  id="vehicle-plate-input"
                  required
                  placeholder="e.g., KDH 420X"
                  value={vehicleForm.plateNumber}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="vehicle-carid-input">Internal Car ID</label>
                <input
                  id="vehicle-carid-input"
                  required
                  placeholder="e.g., CAR_003 (from GPS device)"
                  value={vehicleForm.carId}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, carId: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="vehicle-owner-select">Assign Owner (Optional)</label>
                <select
                  id="vehicle-owner-select"
                  className="form-select"
                  value={vehicleForm.ownerId}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, ownerId: e.target.value })}
                >
                  <option value="">-- No Owner --</option>
                  {matAdmins.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <footer className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setVehicleModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Vehicle
              </button>
            </footer>
          </form>
        </Modal>
      )}

      {stageModal && (
        <Modal title="Add New Stage" onClose={() => setStageModal(false)}>
          <form onSubmit={addStage}>
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="stage-name-input">Stage Name</label>
                <input
                  id="stage-name-input"
                  required
                  placeholder="e.g., Kenyatta Avenue"
                  value={stageForm.name}
                  onChange={(e) => setStageForm({ ...stageForm, name: e.target.value })}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="latitude-input">Latitude</label>
                  <input
                    id="latitude-input"
                    required
                    inputMode="decimal"
                    placeholder="e.g., -1.2833"
                    value={stageForm.latitude}
                    onChange={(e) => setStageForm({ ...stageForm, latitude: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="longitude-input">Longitude</label>
                  <input
                    id="longitude-input"
                    required
                    inputMode="decimal"
                    placeholder="e.g., 36.8167"
                    value={stageForm.longitude}
                    onChange={(e) => setStageForm({ ...stageForm, longitude: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <footer className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setStageModal(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save Stage
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
