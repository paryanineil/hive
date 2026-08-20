import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "hive:week-start"

/** 0 = Sunday, 1 = Monday, … 6 = Saturday (matches date-fns `weekStartsOn`). */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6

function read(): WeekStart {
  // Default to Monday; an explicit saved choice always wins.
  if (typeof window === "undefined") return 1
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) return 1
  const v = parseInt(raw, 10)
  return (v >= 0 && v <= 6 ? v : 1) as WeekStart
}

/**
 * Persisted per-user preference for which day the week starts on, used by the
 * calendar view. Stored in localStorage so it sticks across reloads and tabs.
 */
export function useWeekStart(): [WeekStart, (v: WeekStart) => void] {
  const [weekStart, setWeekStart] = useState<WeekStart>(read)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setWeekStart(read())
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const set = useCallback((v: WeekStart) => {
    setWeekStart(v)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(v))
    } catch {
      // ignore storage failures (e.g. private mode)
    }
  }, [])

  return [weekStart, set]
}
