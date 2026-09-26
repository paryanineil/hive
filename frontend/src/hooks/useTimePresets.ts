import { useCallback, useEffect, useState } from "react"
import { normalizeTime } from "@/lib/taskTime"

const STORAGE_KEY = "hive:time-presets"
// `storage` only fires in *other* tabs; this event keeps pickers in the same tab current.
const CHANGE_EVENT = "hive:time-presets-changed"

export type TimePresetKey = "morning" | "afternoon" | "evening" | "night"
export type TimePresets = Record<TimePresetKey, string>

export const TIME_PRESET_LABELS: Record<TimePresetKey, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
}

export const DEFAULT_TIME_PRESETS: TimePresets = {
  morning: "09:00",
  afternoon: "12:00",
  evening: "18:00",
  night: "21:00",
}

function read(): TimePresets {
  if (typeof window === "undefined") return DEFAULT_TIME_PRESETS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_TIME_PRESETS
    const saved = JSON.parse(raw) as Partial<Record<TimePresetKey, string>>
    const out = { ...DEFAULT_TIME_PRESETS }
    for (const k of Object.keys(out) as TimePresetKey[]) {
      const t = normalizeTime(saved[k])
      if (t) out[k] = t
    }
    return out
  } catch {
    return DEFAULT_TIME_PRESETS
  }
}

function persist(next: TimePresets) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore storage failures (e.g. private mode)
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/**
 * The four time-of-day shortcuts offered by date pickers (Morning 9 AM,
 * Afternoon 12 PM, Evening 6 PM, Night 9 PM by default). Per-user, stored in
 * localStorage like the week-start preference; editable in Settings → General.
 */
export function useTimePresets(): [TimePresets, (key: TimePresetKey, time: string) => void, () => void] {
  const [presets, setPresets] = useState<TimePresets>(read)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPresets(read())
    }
    const onChange = () => setPresets(read())
    window.addEventListener("storage", onStorage)
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(CHANGE_EVENT, onChange)
    }
  }, [])

  const setPreset = useCallback((key: TimePresetKey, time: string) => {
    const t = normalizeTime(time)
    if (!t) return
    const next = { ...read(), [key]: t }
    setPresets(next)
    persist(next)
  }, [])

  const reset = useCallback(() => {
    setPresets(DEFAULT_TIME_PRESETS)
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])

  return [presets, setPreset, reset]
}
