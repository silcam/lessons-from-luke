/**
 * Typed accessor for the ENFORCE_API_AUTH environment flag.
 *
 * Reads process.env.ENFORCE_API_AUTH at call time (no module-level state).
 * Default is ON: absent or empty → true (empty is treated as "unset").
 * Only an explicit opt-out — "0" or "false" — disables enforcement.
 */
export function isEnforcementEnabled(): boolean {
  const value = process.env.ENFORCE_API_AUTH;
  if (!value) return true;
  if (value === "0" || value === "false") return false;
  return true;
}
