export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  build_id: string;
  device_class: string;
  data?: Record<string, unknown>;
}

export function redactSensitive(entry: LogEntry): LogEntry {
  const clone: LogEntry = { ...entry };
  if (clone.data) {
    if ("frames" in clone.data) {
      clone.data.frames = "[redacted]";
    }
    if ("location" in clone.data) {
      clone.data.location = "[redacted]";
    }
  }
  return clone;
}

export function formatLog(entry: LogEntry): string {
  const redacted = redactSensitive(entry);
  return JSON.stringify(redacted);
}