/**
 * Task time-of-day helpers. Times are optional and always ride alongside a
 * date (start_time with start_date, due_time with due_date).
 *
 * Frappe returns Time fields as "9:00:00" (no leading zero) or with
 * microseconds ("18:30:00.000000"); the UI works in "HH:mm".
 */

/** Normalise any Frappe/HTML time value to "HH:mm", or undefined when unset/invalid. */
export function normalizeTime(value?: string | null): string | undefined {
  if (!value) return undefined
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!m) return undefined
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h > 23 || min > 59) return undefined
  return `${String(h).padStart(2, "0")}:${m[2]}`
}

/** "HH:mm:00" for the API, or null to clear. */
export function toServerTime(value?: string | null): string | null {
  const t = normalizeTime(value)
  return t ? `${t}:00` : null
}

/** "9 AM" / "6:30 PM"; empty string when there is no time. */
export function formatTime(value?: string | null): string {
  const t = normalizeTime(value)
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  const suffix = h < 12 ? "AM" : "PM"
  const h12 = h % 12 || 12
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`
}

/** Minutes since midnight, for comparisons. */
export function timeToMinutes(value?: string | null): number | undefined {
  const t = normalizeTime(value)
  if (!t) return undefined
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

/**
 * Sort key for "date + optional time". Within a day, timed tasks come first in
 * time order and untimed ones last — an untimed task is due by end of day.
 * Missing dates sort after everything.
 */
export function dateTimeSortKey(date?: string | null, time?: string | null): string {
  if (!date) return "9999-12-31 99:99"
  return `${date.slice(0, 10)} ${normalizeTime(time) ?? "99:99"}`
}

/**
 * Parse a trailing time off typed input: "tomorrow 6pm", "fri evening",
 * "today 14:30". A bare number is NOT treated as a time (it could be a day,
 * as in "Aug 17") — a time needs a colon, am/pm, or a preset word.
 */
const TRAILING_TIME = /(?:^|\s+)(\d{1,2}:\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm)|morning|afternoon|evening|night|noon|midnight)$/i

export function splitTypedTime(
  input: string,
  presets: Record<string, string>,
): { rest: string; time?: string } {
  const m = TRAILING_TIME.exec(input.trim())
  if (!m) return { rest: input }
  const token = m[1].toLowerCase().replace(/\s+/g, "")
  const rest = input.trim().slice(0, m.index).trim()
  if (token in presets) return { rest, time: presets[token] }
  if (token === "noon") return { rest, time: "12:00" }
  if (token === "midnight") return { rest, time: "00:00" }
  const tm = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(token)
  if (!tm) return { rest: input }
  let h = parseInt(tm[1], 10)
  const min = parseInt(tm[2] ?? "0", 10)
  if (tm[3]) {
    if (h < 1 || h > 12) return { rest: input }
    h = (h % 12) + (tm[3] === "pm" ? 12 : 0)
  }
  if (h > 23 || min > 59) return { rest: input }
  return { rest, time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` }
}
