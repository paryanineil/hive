/**
 * Shared due-date state for tasks.
 *
 * Compares calendar days, not timestamps. `new Date("2026-07-26") < new Date()`
 * is true from midnight onwards, which wrongly marked tasks due *today* as
 * overdue — and disagreed with the backend, which defines overdue as
 * `due_date < today` (see api.py).
 */
export type DueState = "none" | "overdue" | "today" | "upcoming"

/** Local YYYY-MM-DD for a Date (avoids the UTC shift of toISOString). */
function localDayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  const day = `${d.getDate()}`.padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

export function getDueState(dueDate?: string | null, status?: string): DueState {
  if (!dueDate) return "none"
  // Completed / someday tasks are never chased.
  if (status === "Done" || status === "Someday") return "none"
  const due = dueDate.slice(0, 10)
  const today = localDayKey(new Date())
  if (due < today) return "overdue"
  if (due === today) return "today"
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
