import { useCallback, useState } from "react"

const STORAGE_KEY = "hive:calendar-day-order"

type DayOrder = Record<string, string[]>

function read(): DayOrder {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DayOrder) : {}
  } catch {
    return {}
  }
}

/**
 * Manual ordering of task chips within a calendar day.
 *
 * Tasks have no "position" field, so this is a per-user display preference kept
 * in localStorage — keyed by day (yyyy-MM-dd) holding task names in order.
 * Unknown/new tasks fall to the end, and stale names are ignored, so the stored
 * order degrades gracefully as tasks come and go.
 */
export function useCalendarOrder() {
  const [order, setOrder] = useState<DayOrder>(read)

  const applyOrder = useCallback((dayKey: string, tasks: string[]): string[] => {
    const saved = order[dayKey]
    if (!saved?.length) return tasks
    const rank = new Map(saved.map((n, i) => [n, i]))
    // Stable: ranked tasks first in their saved order, unranked keep their
    // incoming (date-sorted) order at the end.
    return [...tasks].sort((a, b) => {
      const ra = rank.has(a) ? rank.get(a)! : Number.MAX_SAFE_INTEGER
      const rb = rank.has(b) ? rank.get(b)! : Number.MAX_SAFE_INTEGER
      return ra - rb
    })
  }, [order])

  const setDayOrder = useCallback((dayKey: string, names: string[]) => {
    setOrder((prev) => {
      const next = { ...prev, [dayKey]: names }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignore quota/private-mode failures
      }
      return next
    })
  }, [])

  return { applyOrder, setDayOrder }
}
