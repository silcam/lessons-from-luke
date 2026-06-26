/**
 * Typed accessor for the ENFORCE_API_AUTH environment flag.
 *
 * Reads process.env.ENFORCE_API_AUTH at call time (no module-level state).
 * Default is OFF: absent, empty, or falsy string → false.
 * Only "truthy" non-empty, non-"0" strings → true.
 */
export function isEnforcementEnabled(): boolean {
  const value = process.env.ENFORCE_API_AUTH;
  if (!value) return false;
  if (value === "0") return false;
  return true;
}
