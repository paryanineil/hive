import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "hive:show-completed"

/**
 * Shared, persisted toggle controlling whether completed (Done) tasks are
 * visible across every task view (list, kanban, calendar, timeline, and the
 * per-project board). Defaults to hidden. Persisted in localStorage so the
 * choice sticks across navigations, reloads, and browser tabs.
 */
export function useShowCompleted(): [boolean, () => void] {
  const [showCompleted, setShowCompleted] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return window.localStorage.getItem(STORAGE_KEY) === "1"
  })

  // Keep other open tabs in sync when the toggle changes.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setShowCompleted(e.newValue === "1")
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const toggle = useCallback(() => {
    setShowCompleted((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0")
      } catch {
        // ignore storage failures (e.g. private mode)
      }
      return next
    })
  }, [])

  return [showCompleted, toggle]
}
