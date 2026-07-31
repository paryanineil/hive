import { useCallback, useState } from "react"

const STORAGE_KEY = "hive:group-colors"

/** Pickable colours for calendar grouping. Value is the Tailwind bg- class. */
export const COLOR_CHOICES: { value: string; label: string }[] = [
  { value: "bg-red-500", label: "Red" },
  { value: "bg-orange-500", label: "Orange" },
  { value: "bg-amber-500", label: "Amber" },
  { value: "bg-yellow-500", label: "Yellow" },
  { value: "bg-lime-500", label: "Lime" },
  { value: "bg-green-500", label: "Green" },
  { value: "bg-emerald-500", label: "Emerald" },
  { value: "bg-teal-500", label: "Teal" },
  { value: "bg-cyan-500", label: "Cyan" },
  { value: "bg-sky-500", label: "Sky" },
  { value: "bg-blue-500", label: "Blue" },
  { value: "bg-indigo-500", label: "Indigo" },
  { value: "bg-violet-500", label: "Violet" },
  { value: "bg-fuchsia-500", label: "Fuchsia" },
  { value: "bg-pink-500", label: "Pink" },
  { value: "bg-slate-400", label: "Grey" },
]

type ColorMap = Record<string, string>

function read(): ColorMap {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ColorMap) : {}
  } catch {
    return {}
  }
}

/**
 * Per-user colour overrides for calendar groups.
 *
 * Keyed "<groupBy>:<groupValue>" so the same name under a different grouping
 * (e.g. a project and an assignee both called "BD") can be coloured separately.
 * Anything without an override falls back to the computed default.
 */
export function useGroupColors() {
  const [colors, setColors] = useState<ColorMap>(read)

  const keyFor = (groupBy: string, group: string) => `${groupBy}:${group}`

  const getColor = useCallback(
    (groupBy: string, group: string): string | undefined => colors[keyFor(groupBy, group)],
    [colors],
  )

  const write = useCallback((next: ColorMap) => {
    setColors(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore quota / private-mode failures
    }
  }, [])

  const setColor = useCallback((groupBy: string, group: string, color: string) => {
    write({ ...colors, [keyFor(groupBy, group)]: color })
  }, [colors, write])

  const resetColor = useCallback((groupBy: string, group: string) => {
    const next = { ...colors }
    delete next[keyFor(groupBy, group)]
    write(next)
  }, [colors, write])

  return { getColor, setColor, resetColor }
}
