/**
 * Placeholder validation helper for the telemetry schema.
 *
 * This file is intentionally not wired into CI to avoid introducing
 * Node.js dependencies. It documents how a consumer could load and
 * validate telemetry payloads locally.
 */
export function validateTelemetry(_: unknown): boolean {
  // Implement JSON schema validation in app-specific tooling.
  return true;
}
