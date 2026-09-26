import { useState } from "react"
import {
  addDays,
  format,
  isValid,
  nextMonday,
  nextSaturday,
  parse,
  startOfDay,
} from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Calendar03Icon,
  Sun02Icon,
  Sofa01Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  SunriseIcon,
  Sun03Icon,
  SunsetIcon,
  Moon02Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useWeekStart } from "@/hooks/useWeekStart"
import { useTimePresets, TIME_PRESET_LABELS, type TimePresetKey } from "@/hooks/useTimePresets"
import { formatTime, normalizeTime, splitTypedTime } from "@/lib/taskTime"

/**
 * Parse a typed date. Accepts natural shorthand ("today", "next fri") and the
 * common numeric/spelled formats, so the box is forgiving about how you type it.
 * Returns undefined when nothing sensible matches.
 */
export function parseTypedDate(input: string, today = new Date()): Date | undefined {
  const raw = input.trim().toLowerCase()
  if (!raw) return undefined
  const base = startOfDay(today)

  if (["today", "tod", "now"].includes(raw)) return base
  if (["tomorrow", "tom", "tmrw", "tmr"].includes(raw)) return addDays(base, 1)
  if (["yesterday"].includes(raw)) return addDays(base, -1)
  if (["weekend", "this weekend"].includes(raw)) return nextSaturday(base)
  if (["next week"].includes(raw)) return nextMonday(base)

  // "in 3 days" / "3d"
  const inDays = raw.match(/^(?:in\s+)?(\d+)\s*(?:d|days?)$/)
  if (inDays) return addDays(base, parseInt(inDays[1], 10))

  // Weekday names, optionally prefixed with "next".
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const wd = raw.replace(/^next\s+/, "")
  const idx = days.findIndex((d) => d === wd || d.slice(0, 3) === wd)
  if (idx !== -1) {
    const delta = (idx - base.getDay() + 7) % 7
    return addDays(base, delta === 0 ? 7 : delta)
  }

  // Numeric / spelled formats. Day-first before month-first: this app's users
  // write 08/09 as 8 September.
  const formats = ["yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yyyy", "d MMM yyyy", "MMM d yyyy", "d MMM", "MMM d", "d/M", "d-M"]
  for (const f of formats) {
    const parsed = parse(input.trim(), f, base)
    if (isValid(parsed)) return startOfDay(parsed)
  }
  return undefined
}

const PRESET_ICONS: Record<TimePresetKey, typeof SunriseIcon> = {
  morning: SunriseIcon,
  afternoon: Sun03Icon,
  evening: SunsetIcon,
  night: Moon02Icon,
}

interface DatePickerFieldProps {
  date: Date | undefined
  onSelect: (date: Date | undefined) => void
  disabled?: boolean
  placeholder?: string
  /** Rendered inside a <form>? Keeps the trigger from submitting it. */
  asButtonType?: "button" | "submit"
  /**
   * Optional time of day ("HH:mm", or Frappe's "9:00:00"). Passing
   * `onTimeChange` turns on the time section; omit it for date-only fields.
   */
  time?: string | null
  onTimeChange?: (time: string | undefined) => void
}

/**
 * Date field with quick presets (Today / Tomorrow / This weekend / Next week),
 * a free-text box, a full calendar, and a clear action. With `onTimeChange`,
 * also offers time-of-day shortcuts (Morning / Afternoon / Evening / Night,
 * configurable in Settings) and a custom time.
 */
export function DatePickerField({
  date,
  onSelect,
  disabled,
  placeholder = "Pick a date",
  asButtonType = "button",
  time,
  onTimeChange,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false)
  const [weekStartsOn] = useWeekStart()
  const [presets] = useTimePresets()
  const [typed, setTyped] = useState("")
  const [typedError, setTypedError] = useState(false)
  const withTime = !!onTimeChange
  const currentTime = normalizeTime(time)

  const today = startOfDay(new Date())
  const choose = (d: Date | undefined) => {
    onSelect(d)
    // A time without its date means nothing — clearing the date clears it.
    if (!d && currentTime) onTimeChange?.(undefined)
    setOpen(false)
    setTyped("")
    setTypedError(false)
  }

  /** Set a time; with no date yet, the time applies to today. */
  const chooseTime = (t: string | undefined, close = true) => {
    if (t && !date) onSelect(today)
    onTimeChange?.(t)
    if (close) {
      setOpen(false)
      setTyped("")
      setTypedError(false)
    }
  }

  const quick = [
    { label: "Today", icon: Calendar03Icon, value: today, hint: format(today, "EEE") },
    { label: "Tomorrow", icon: Sun02Icon, value: addDays(today, 1), hint: format(addDays(today, 1), "EEE") },
    { label: "This weekend", icon: Sofa01Icon, value: nextSaturday(today), hint: format(nextSaturday(today), "EEE") },
    { label: "Next week", icon: ArrowRight02Icon, value: nextMonday(today), hint: format(nextMonday(today), "EEE MMM d") },
  ]

  const commitTyped = () => {
    if (withTime) {
      // "tomorrow 6pm", "fri evening", or just "6pm" (today).
      const { rest, time: typedTime } = splitTypedTime(typed, presets)
      if (typedTime) {
        const d = rest ? parseTypedDate(rest) : date ?? today
        if (d) {
          onSelect(d)
          onTimeChange?.(typedTime)
          setOpen(false)
          setTyped("")
          setTypedError(false)
        } else {
          setTypedError(true)
        }
        return
      }
    }
    const parsed = parseTypedDate(typed)
    if (parsed) choose(parsed)
    else setTypedError(true)
  }

  const label = date
    ? `${format(date, "MMM d, yyyy")}${withTime && currentTime ? ` · ${formatTime(currentTime)}` : ""}`
    : undefined

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type={asButtonType}
              variant="outline"
              disabled={disabled}
              className={cn("w-full justify-start text-left font-normal", date && "pr-9")}
            />
          }
        >
          <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} className="mr-2 size-4 shrink-0" />
          {label ? <span className="truncate">{label}</span> : <span className="text-muted-foreground">{placeholder}</span>}
        </PopoverTrigger>
        <PopoverContent className="max-h-(--available-height) w-auto overflow-y-auto p-0" align="start">
          <div className="border-b p-2">
            <Input
              value={typed}
              onChange={(e) => { setTyped(e.target.value); setTypedError(false) }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitTyped() }
              }}
              placeholder={withTime ? "Type a date or time" : "Type a date"}
              className={cn("h-8 text-sm", typedError && "border-destructive")}
              aria-invalid={typedError}
            />
            {typedError && (
              <p className="mt-1 text-[11px] text-destructive">
                {withTime
                  ? "Try “tomorrow 6pm”, “fri evening”, or 2026-08-17"
                  : "Try “tomorrow”, “next fri”, or 2026-08-17"}
              </p>
            )}
          </div>

          <div className="border-t">
            <Calendar mode="single" weekStartsOn={weekStartsOn} selected={date} onSelect={(d) => choose(d)} />
          </div>

          <div className="border-t p-1">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => choose(q.value)}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <HugeiconsIcon icon={q.icon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">{q.label}</span>
                <span className="text-xs text-muted-foreground">{q.hint}</span>
              </button>
            ))}
          </div>

          {withTime && (
            <div className="border-t p-2">
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                <HugeiconsIcon icon={Clock01Icon} strokeWidth={2} className="size-3.5" />
                Time
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(TIME_PRESET_LABELS) as TimePresetKey[]).map((key) => {
                  const active = currentTime === presets[key]
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => chooseTime(presets[key])}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                        active && "border-primary bg-primary/10 text-primary",
                      )}
                    >
                      <HugeiconsIcon icon={PRESET_ICONS[key]} strokeWidth={2} className="size-3.5 shrink-0" />
                      <span className="flex-1 font-medium">{TIME_PRESET_LABELS[key]}</span>
                      <span className={cn("text-muted-foreground", active && "text-primary")}>{formatTime(presets[key])}</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Input
                  type="time"
                  value={currentTime ?? ""}
                  onChange={(e) => chooseTime(normalizeTime(e.target.value), false)}
                  className="h-8 flex-1 text-sm"
                  aria-label="Custom time"
                />
                {currentTime && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    onClick={() => chooseTime(undefined)}
                  >
                    No time
                  </Button>
                )}
              </div>
            </div>
          )}

          {date && (
            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-center text-xs text-muted-foreground"
                onClick={() => choose(undefined)}
              >
                Clear date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {date && !disabled && (
        <button
          type="button"
          aria-label="Remove date"
          title="Remove date"
          onClick={(e) => {
            e.stopPropagation()
            onSelect(undefined)
            if (currentTime) onTimeChange?.(undefined)
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
        </button>
      )}
    </div>
  )
}
