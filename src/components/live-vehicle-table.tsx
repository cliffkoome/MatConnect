import type { LiveVehicleRow } from "@/lib/client/types";

const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** Live vehicle status table used on both dashboards. */
export function LiveVehicleTable({
  vehicles,
  error,
  showRoute = true,
}: {
  vehicles: LiveVehicleRow[] | null;
  error: boolean;
  showRoute?: boolean;
}) {
  const columns = showRoute ? 4 : 3;
  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Vehicle</th>
            {showRoute && <th>Route</th>}
            <th>Status</th>
            <th>{showRoute ? "Location" : "Current Location"}</th>
          </tr>
        </thead>
        <tbody>
          {error ? (
            <tr>
              <td colSpan={columns} className="error-message">
                Could not load vehicle data.
              </td>
            </tr>
          ) : !vehicles ? (
            <tr>
              <td colSpan={columns}>Loading vehicle data...</td>
            </tr>
          ) : vehicles.length === 0 ? (
            <tr>
              <td colSpan={columns}>No vehicles found.</td>
            </tr>
          ) : (
            vehicles.map((v) => (
              <tr key={v.id}>
                <td>{v.plateNumber}</td>
                {showRoute && <td>{v.route}</td>}
                <td>
                  <span className={`badge ${v.status === "Online" ? "badge-success" : "badge-danger"}`}>{v.status}</span>
                </td>
                <td>
                  {v.latitude != null && v.longitude != null ? (
                    <a href={mapsUrl(v.latitude, v.longitude)} target="_blank" rel="noreferrer" title="View on Google Maps">
                      {v.location}
                    </a>
                  ) : (
                    v.location || "N/A"
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
