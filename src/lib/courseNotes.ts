export interface TimestampedCourseNote {
  id: string;
  lessonId: string;
  lessonTitle: string;
  timestampSeconds: number;
  content: string;
  createdAt: string;
}

export function courseTimestampNotesKey(userId: string, courseId: string): string {
  return "bfs-course-timestamped-notes:" + (userId || "anonymous") + ":" + courseId;
}

export function formatMediaTimestamp(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  return hours > 0
    ? String(hours) + ":" + String(minutes).padStart(2, "0") + ":" + String(remainingSeconds).padStart(2, "0")
    : String(minutes).padStart(2, "0") + ":" + String(remainingSeconds).padStart(2, "0");
}

export function parseMediaTimestamp(value: string): number | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) return Number(normalized);
  if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(normalized)) return null;
  const parts = normalized.split(":").map(Number);
  if (parts.slice(1).some((part) => part > 59)) return null;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

export function loadTimestampedCourseNotes(key: string): TimestampedCourseNote[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TimestampedCourseNote =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as TimestampedCourseNote).id === "string" &&
      typeof (item as TimestampedCourseNote).lessonId === "string" &&
      typeof (item as TimestampedCourseNote).lessonTitle === "string" &&
      Number.isFinite((item as TimestampedCourseNote).timestampSeconds) &&
      typeof (item as TimestampedCourseNote).content === "string" &&
      typeof (item as TimestampedCourseNote).createdAt === "string"
    );
  } catch {
    return [];
  }
}

export function saveTimestampedCourseNotes(key: string, notes: TimestampedCourseNote[]): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(notes));
    return true;
  } catch {
    return false;
  }
}

export function createTimestampedCourseNote(input: Omit<TimestampedCourseNote, "id" | "createdAt">): TimestampedCourseNote {
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  return { ...input, id: randomId, createdAt: new Date().toISOString() };
}
