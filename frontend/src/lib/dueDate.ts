import { timeToMinutes } from "@/lib/taskTime"

/**
 * Shared due-date state for tasks.
 *
 * Compares calendar days, not timestamps. `new Date("2026-07-26") < new Date()`
 * is true from midnight onwards, which wrongly marked tasks due *today* as
 * overdue. With a due time, a task due today turns overdue once that time has
 * passed; without one it stays "today" all day. Mirrors the backend's
 * definition in due.py.
 */
export type DueState = "none" | "overdue" | "today" | "upcoming"

/** Local YYYY-MM-DD for a Date (avoids the UTC shift of toISOString). */
function localDayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  const day = `${d.getDate()}`.padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

export function getDueState(dueDate?: string | null, status?: string, dueTime?: string | null): DueState {
  if (!dueDate) return "none"
  // Completed / someday tasks are never chased.
  if (status === "Done" || status === "Someday") return "none"
  const due = dueDate.slice(0, 10)
  const now = new Date()
  const today = localDayKey(now)
  if (due < today) return "overdue"
  if (due === today) {
    const mins = timeToMinutes(dueTime)
    if (mins !== undefined && mins < now.getHours() * 60 + now.getMinutes()) return "overdue"
    return "today"
  }
  return "upcoming"
}

/** Text colour for a due-date label. Overdue is deliberately darker than "today". */
export const DUE_TEXT_CLASS: Record<DueState, string> = {
  overdue: "text-red-700 dark:text-red-400 font-semibold",
  today: "text-amber-600 dark:text-amber-400 font-medium",
  upcoming: "text-muted-foreground",
  none: "text-muted-foreground",
}

/** Badge/dot colour for the same states. */
export const DUE_BG_CLASS: Record<DueState, string> = {
  overdue: "bg-red-700 dark:bg-red-500",
  today: "bg-amber-500",
  upcoming: "bg-muted-foreground/40",
  none: "bg-muted-foreground/40",
}
