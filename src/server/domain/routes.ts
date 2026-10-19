/**
 * Human-readable route label from the stages a vehicle serves ("A - Z", a single stage name, or
 * "Not Assigned"). Stages are sorted by name for a stable label until stages get an explicit order.
 */
export function describeRoute(stageNames: string[]): string {
  if (stageNames.length === 0) return "Not Assigned";
  const sorted = [...stageNames].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 1) return sorted[0]!;
  return `${sorted[0]} - ${sorted[sorted.length - 1]}`;
}
