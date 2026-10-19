/** Response shapes of the JSON API, as the browser sees them (dates are ISO strings). */

export type Role = "Passenger" | "Admin" | "MatAdmin";

export type FieldError = { field: string; message: string };

export type Profile = {
  id: number;
  name: string;
  email: string;
  role: Role;
  phoneNumber: string | null;
  profilePictureUrl: string | null;
  twoFactorEnabled: boolean;
  disabled: boolean;
  isGoogleUser: boolean;
  createdAt: string;
};

export type LoginResponse =
  | { twoFactorRequired: true; tempToken: string }
  | { message: string; accessToken: string; role: Role; twoFactorRequired?: undefined };

export type Stage = { id: number; name: string; latitude: number; longitude: number };

export type VehicleSummary = {
  id: number;
  carId: string;
  plateNumber: string;
  ownerId: number | null;
  isAtStage: boolean;
};

export type StageWithVehicles = Stage & { vehicles: VehicleSummary[] };

export type VehicleStatus = "Offline" | "Too Far" | "No Route" | "Approaching" | "Arrived" | "Departed";
export type Arrival = { id: number; carId: string; plateNumber: string; eta: string; status: VehicleStatus };
export type StageEta = { stageName: string; arrivals: Arrival[] };

export type LiveVehicleRow = {
  id: number;
  plateNumber: string;
  status: "Online" | "Offline";
  gpsStatus: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  route: string;
};

export type FeedbackItem = {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  user: { name: string };
  vehicle: { plateNumber: string };
};

export type UserRow = {
  id: number;
  name: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
  disabled: boolean;
};

export type Page<K extends string, T> = { [key in K]: T[] } & { total: number };

export type Period = "daily" | "weekly" | "monthly";
export type PeriodTotal = { period: string; total: number };
export type ChartData = { distance: PeriodTotal[]; trips: PeriodTotal[] };

export type VehicleStats = VehicleSummary & {
  date: string;
  distanceKm: number;
  trips: number;
  recentFeedback: FeedbackItem[];
};

export type DashboardSummary = { totalVehicles: number; totalDistanceToday: number; totalTripsToday: number };
