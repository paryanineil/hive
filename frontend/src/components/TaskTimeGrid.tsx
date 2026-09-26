import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { format, isToday } from "date-fns"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"
import { getDueState } from "@/lib/dueDate"
import { formatTime, timeToMinutes } from "@/lib/taskTime"
import type { HiveTask } from "@/types"

export const SNAP_MIN = 15
/**
 * Hour rows are sized so about this many hours fit in the visible grid; the
 * clamp keeps blocks legible on tiny screens and not bloated on huge ones.
 */
const VISIBLE_HOURS = 12
const MIN_HOUR_PX = 28
const MAX_HOUR_PX = 72
const FALLBACK_HOUR_PX = 40
const DAY_MIN = 24 * 60
/** Deadline-style tasks (a single time) draw as a one-hour block, matching the Google Calendar sync. */
const DEFAULT_MIN = 60

/**
 * What a timed block represents on its day: a start→due window on one day, or
 * just the start time / due time landing on that day.
 */
export type TimedField = "window" | "start" | "due"

export interface TimedItem {
  task: HiveTask
  start: number
  end: number
  field: TimedField
  col: number
  cols: number
}

/** Which of the task's times sits on this day (if any), and what it spans. */
export function timedSlot(task: HiveTask, dayKey: string): Omit<TimedItem, "col" | "cols"> | null {
  const startDay = task.start_date?.slice(0, 10)
  const dueDay = task.due_date?.slice(0, 10)
  const s = startDay === dayKey ? timeToMinutes(task.start_time) : undefined
  const d = dueDay === dayKey ? timeToMinutes(task.due_time) : undefined
  if (s !== undefined && d !== undefined) {
    return { task, start: s, end: d > s ? d : Math.min(s + DEFAULT_MIN, DAY_MIN), field: "window" }
  }
  if (s !== undefined) return { task, start: s, end: Math.min(s + DEFAULT_MIN, DAY_MIN), field: "start" }
  if (d !== undefined) return { task, start: d, end: Math.min(d + DEFAULT_MIN, DAY_MIN), field: "due" }
  return null
}

/**
 * Split a day's tasks into timed blocks (laid out side by side where they
 * overlap) and the all-day lane. `tasks` keeps its incoming order for the lane.
 */
export function layoutDay(tasks: HiveTask[], dayKey: string): { timed: TimedItem[]; allDay: HiveTask[] } {
  const allDay: HiveTask[] = []
  const slots: Omit<TimedItem, "col" | "cols">[] = []
  for (const t of tasks) {
    const slot = timedSlot(t, dayKey)
    if (slot) slots.push(slot)
    else allDay.push(t)
  }
  slots.sort((a, b) => a.start - b.start || b.end - a.end)

  const timed: TimedItem[] = []
  let cluster: TimedItem[] = []
  let clusterEnd = -1
  let colEnds: number[] = []
  const closeCluster = () => {
    for (const item of cluster) item.cols = colEnds.length
    cluster = []
    colEnds = []
  }
  for (const s of slots) {
    if (s.start >= clusterEnd) closeCluster()
    let col = colEnds.findIndex((end) => end <= s.start)
    if (col === -1) {
      col = colEnds.length
      colEnds.push(s.end)
    } else {
      colEnds[col] = s.end
    }
    const item: TimedItem = { ...s, col, cols: 1 }
    cluster.push(item)
    timed.push(item)
    clusterEnd = Math.max(clusterEnd, s.end)
  }
  closeCluster()
  return { timed, allDay }
}

export function minutesToHHmm(mins: number): string {
  const m = Math.max(0, Math.min(DAY_MIN - 1, Math.round(mins)))
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

/** Nearest ancestor that scrolls vertically (the app's content pane), if any. */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if (oy === "auto" || oy === "scroll") return p
  }
  return null
}

const MIN_GRID_PX = 420

function hourLabel(h: number): string {
  const suffix = h < 12 ? "AM" : "PM"
  return `${h % 12 || 12} ${suffix}`
}

function TimedBlock({
  item, dayKey, color, onClick, detailed, hourPx,
}: { item: TimedItem; dayKey: string; color: string; onClick: () => void; detailed: boolean; hourPx: number }) {
  const { task } = item
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `timed|${dayKey}|${task.name}` })
  const overdue = getDueState(task.due_date, task.status, task.due_time) === "overdue"
  const heightPx = Math.max(((item.end - item.start) / 60) * hourPx, 22)
  const compact = heightPx < 36
  const range = item.field === "window"
    ? `${formatTime(minutesToHHmm(item.start))} – ${formatTime(minutesToHHmm(item.end))}`
    : `${item.field === "due" ? "Due " : ""}${formatTime(minutesToHHmm(item.start))}`
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-timed-block=""
      onClick={onClick}
      title={`${task.title} · ${range}${overdue ? " — overdue" : ""}`}
      style={{
        top: (item.start / 60) * hourPx,
        height: heightPx,
        left: `calc(${(item.col / item.cols) * 100}% + 2px)`,
        width: `calc(${100 / item.cols}% - 4px)`,
      }}
      className={cn(
        "absolute z-10 flex overflow-hidden rounded-md bg-card text-left text-[11px] leading-tight shadow-sm ring-1 ring-border transition-colors hover:bg-accent",
        isDragging && "opacity-40",
        overdue && "ring-red-700/70 dark:ring-red-500/70",
      )}
      {...listeners}
      {...attributes}
    >
      <span className={cn("w-1 shrink-0", overdue ? "bg-red-700 dark:bg-red-500" : color)} />
      <span className={cn("min-w-0 flex-1 px-1.5", compact ? "flex items-center gap-1 py-0" : "py-1")}>
        <span className={cn("block truncate font-medium", overdue && "text-red-700 dark:text-red-400")}>
          {overdue && <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="mr-0.5 inline size-3 align-[-2px]" />}
          {task.title}
        </span>
        <span className={cn("block truncate text-muted-foreground", compact && "shrink-0")}>
          {range}
          {detailed && !compact && ` · ${task.status}`}
        </span>
      </span>
    </button>
  )
}

function AllDayLane({ dayKey, children }: { dayKey: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayKey}` })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "max-h-28 min-h-9 space-y-1 overflow-y-auto border-r p-1 last:border-r-0",
        isOver && "bg-primary/10 ring-1 ring-inset ring-primary/40",
      )}
    >
      {children}
    </div>
  )
}

function SlotColumn({
  dayKey, registerColumn, children, className, height,
}: {
  dayKey: string
  registerColumn: (dayKey: string, el: HTMLDivElement | null) => void
  children: ReactNode
  className?: string
  height: number
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${dayKey}` })
  return (
    <div
      ref={(el) => { setNodeRef(el); registerColumn(dayKey, el) }}
      className={cn("relative border-r last:border-r-0", isOver && "bg-primary/5", className)}
      style={{ height }}
    >
      {children}
    </div>
  )
}

interface TaskTimeGridProps {
  days: Date[]
  /** A day's tasks in lane order (the calendar's dayTasks). */
  tasksForDay: (day: Date) => HiveTask[]
  colorFor: (task: HiveTask) => string
  renderChip: (task: HiveTask, dayKey: string) => ReactNode
  onTaskClick: (task: HiveTask) => void
  /** Lets the calendar measure a day column at drop time to work out the time. */
  registerColumn: (dayKey: string, el: HTMLDivElement | null) => void
}

/**
 * Week / Day view with hour gridlines: an all-day lane for tasks without a
 * time on that day, and a scrollable 24-hour grid where timed tasks sit at
 * their time, side by side when they overlap. Drag handling lives in the
 * parent calendar (it owns the DndContext).
 */
export function TaskTimeGrid({ days, tasksForDay, colorFor, renderChip, onTaskClick, registerColumn }: TaskTimeGridProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const [fillPx, setFillPx] = useState<number | null>(null)
  const [hourPx, setHourPx] = useState<number | null>(null)
  const hp = hourPx ?? FALLBACK_HOUR_PX
  const [now, setNow] = useState(() => new Date())
  const single = days.length === 1

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const layouts = useMemo(
    () => days.map((day) => {
      const dayKey = format(day, "yyyy-MM-dd")
      return { day, dayKey, ...layoutDay(tasksForDay(day), dayKey) }
    }),
    [days, tasksForDay],
  )

  // Scroll to the first timed task (or now, or 8 AM) whenever the visible days change.
  const daysKey = layouts.map((l) => l.dayKey).join(",")
  const measured = hourPx !== null
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !measured) return
    const starts = layouts.flatMap((l) => l.timed.map((t) => t.start))
    const showsToday = layouts.some((l) => isToday(l.day))
    const nowMin = new Date().getHours() * 60
    const target = starts.length
      ? Math.min(...starts, showsToday ? nowMin : DAY_MIN)
      : showsToday ? nowMin : 8 * 60
    el.scrollTop = Math.max(0, ((target - 60) / 60) * hp)
    // Only on navigation (and once the row height is known), not on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey, measured])

  // Stretch the grid to the bottom of the window (as measured with the page
  // scrolled to the top), so the hours get the screen instead of a short box.
  // Re-measured on every render — cheap, and catches things above it changing
  // height, like the colour legend appearing.
  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const measure = () => {
      const pane = scrollParentOf(el)
      const top = el.getBoundingClientRect().top + (pane ? pane.scrollTop : window.scrollY)
      const reserve = (pane ? parseFloat(getComputedStyle(pane).paddingBottom) || 0 : 0) + 4
      const next = Math.max(MIN_GRID_PX, Math.floor(window.innerHeight - top - reserve))
      setFillPx((prev) => (prev !== null && Math.abs(prev - next) <= 1 ? prev : next))
      // Size hour rows so ~12 hours fit below the sticky header + all-day lane.
      const headerH = headerRef.current?.offsetHeight ?? 0
      const hour = Math.round(Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, (next - headerH) / VISIBLE_HOURS)))
      setHourPx((prev) => (prev !== null && Math.abs(prev - hour) <= 1 ? prev : hour))
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  })

  const cols = `56px repeat(${days.length}, minmax(${single ? 0 : 88}px, 1fr))`
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * hp

  return (
    <div ref={outerRef} className="overflow-hidden rounded-md border">
      {/* One scroller for both axes, so the sticky header, all-day lane and hour
          grid share column widths (a separate body scrollbar would misalign them). */}
      <div ref={scrollRef} className="overflow-auto" style={{ maxHeight: fillPx ?? MIN_GRID_PX }}>
        <div style={{ minWidth: single ? undefined : 56 + days.length * 88 }}>
          <div ref={headerRef} className="sticky top-0 z-30 bg-background">
            {/* Day headers */}
            <div className="grid border-b bg-muted/40" style={{ gridTemplateColumns: cols }}>
              <div className="border-r" />
              {layouts.map(({ day, dayKey }) => (
                <div key={dayKey} className="flex items-center justify-center gap-1.5 border-r px-1 py-1.5 last:border-r-0">
                  <span className="text-xs font-medium text-muted-foreground">{format(day, single ? "EEEE" : "EEE")}</span>
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs",
                      isToday(day) && "bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>
              ))}
            </div>

            {/* All-day lane */}
            <div className="grid border-b shadow-sm" style={{ gridTemplateColumns: cols }}>
              <div className="flex items-start justify-end border-r px-1.5 py-2 text-[10px] leading-none text-muted-foreground">
                All day
              </div>
              {layouts.map(({ dayKey, allDay }) => (
                <AllDayLane key={dayKey} dayKey={dayKey}>
                  {allDay.map((t) => renderChip(t, dayKey))}
                </AllDayLane>
              ))}
            </div>
          </div>

          {/* Hour grid */}
          <div>
            <div className="relative grid" style={{ gridTemplateColumns: cols }}>
              {/* Gutter with hour labels */}
              <div className="relative border-r" style={{ height: 24 * hp }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <span
                    key={h}
                    className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                    style={{ top: h * hp }}
                  >
                    {h === 0 ? "" : hourLabel(h)}
                  </span>
                ))}
              </div>

              {layouts.map(({ day, dayKey, timed }) => (
                <SlotColumn
                  key={dayKey}
                  dayKey={dayKey}
                  registerColumn={registerColumn}
                  className={cn(isToday(day) && "bg-primary/[0.03]")}
                  height={24 * hp}
                >
                  {/* Hour gridlines, plus half-hour lines when rows are tall enough to read them */}
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: h * hp, height: hp }}>
                      <div className={cn("h-1/2", h > 0 && "border-t border-border")} />
                      {hp >= 32 && <div className="h-1/2 border-t border-dashed border-border/50" />}
                    </div>
                  ))}

                  {timed.map((item) => (
                    <TimedBlock
                      key={`${item.task.name}-${item.field}`}
                      item={item}
                      dayKey={dayKey}
                      color={colorFor(item.task)}
                      onClick={() => onTaskClick(item.task)}
                      detailed={single}
                      hourPx={hp}
                    />
                  ))}

                  {isToday(day) && (
                    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }}>
                      <div className="relative h-0.5 bg-primary">
                        <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-primary" />
                      </div>
                    </div>
                  )}
                </SlotColumn>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
