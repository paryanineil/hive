import { useCallback, useMemo, useState } from "react"
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import { TASK_STATUS_COLOR, TASK_PRIORITY_VARIANT } from "@/lib/variants"
import { useWeekStart } from "@/hooks/useWeekStart"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { useCalendarOrder } from "@/hooks/useCalendarOrder"
import { useGroupColors, COLOR_CHOICES } from "@/hooks/useGroupColors"
import { useIsMobile } from "@/hooks/use-mobile"
import type { HiveTask, HiveTaskAssignee } from "@/types"

type CalendarMode = "month" | "week" | "day"

interface TaskCalendarProps {
  tasks: HiveTask[]
  onTaskClick: (task: HiveTask) => void
  /** How many task chips to show per day in month view before "+N more". */
  maxPerDay?: number
  /** project name → title, for the "Project" grouping. */
  projectTitles?: Record<string, string>
  /** task name → assignees, for the "Assignee" grouping. */
  assigneesByTask?: Record<string, HiveTaskAssignee[]>
  /**
   * Reschedule a task after it is dragged onto another day. Receives the new
   * dates (span length preserved). Omit to disable drag-between-days.
   */
  onReschedule?: (task: HiveTask, startDate: string | null, dueDate: string | null) => void | Promise<void>
}

type GroupBy = "none" | "status" | "priority" | "project" | "assignee"

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "project", label: "Project" },
  { value: "assignee", label: "Assignee" },
]

/** Palette for generic groups (projects, assignees) — cycled by group index. */
const GROUP_PALETTE = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500",
  "bg-rose-500", "bg-cyan-500", "bg-lime-500", "bg-fuchsia-500",
  "bg-orange-500", "bg-teal-500",
]

/** Status and priority have meaning, so reuse the app's semantic colours. */
const PRIORITY_COLOR: Record<string, string> = {
  Urgent: "bg-red-500",
  High: "bg-orange-500",
  Medium: "bg-yellow-500",
  Low: "bg-slate-400",
}

/** A draggable task chip. Also a drop target, so chips can be reordered onto each other. */
function DraggableChip({
  id, task, color, onClick,
}: { id: string; task: HiveTask; color: string; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id })
  return (
    <button
      ref={(node) => { setNodeRef(node); setDropRef(node) }}
      type="button"
      onClick={onClick}
      title={task.title}
      className={cn(
        "flex w-full items-center gap-1.5 rounded bg-card px-1.5 py-1 text-left text-xs shadow-sm ring-1 ring-border transition-colors hover:bg-accent",
        isDragging && "opacity-40",
        isOver && "ring-2 ring-primary",
      )}
      {...listeners}
      {...attributes}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", color)} />
      <span className="truncate">{task.title}</span>
    </button>
  )
}

/** A day cell that accepts dropped chips. */
function DroppableDay({
  dayKey, className, children,
}: { dayKey: string; className?: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayKey}` })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "bg-primary/10 ring-1 ring-inset ring-primary/40")}>
      {children}
    </div>
  )
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MODES: CalendarMode[] = ["month", "week", "day"]

/**
 * Task calendar with Month / Week / Day modes. Tasks are laid out on their due
 * date; tasks without a due date are surfaced in a tray beneath the grid so
 * they aren't silently hidden.
 */
export function TaskCalendar({
  tasks,
  onTaskClick,
  maxPerDay = 3,
  projectTitles = {},
  assigneesByTask = {},
  onReschedule,
}: TaskCalendarProps) {
  const [mode, setMode] = useState<CalendarMode>("month")
  const [cursor, setCursor] = useState<Date>(() => new Date())
  const [weekStartsOn, setWeekStartsOn] = useWeekStart()
  const [groupBy, setGroupBy] = useState<GroupBy>("none")
  const [activeTask, setActiveTask] = useState<HiveTask | null>(null)
  const isMobile = useIsMobile()
  // Month cells are much shorter on phones — show fewer chips before "+N more".
  const perDay = isMobile ? 2 : maxPerDay
  const { applyOrder, setDayOrder } = useCalendarOrder()
  const { getColor, setColor, resetColor } = useGroupColors()
  const weekOpts = { weekStartsOn } as const

  const sensors = useSensors(
    // A small threshold so a plain click still opens the task.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  /** The group a task belongs to under the current grouping. */
  const groupKeyOf = useCallback((task: HiveTask): string => {
    switch (groupBy) {
      case "status": return task.status || "—"
      case "priority": return task.priority || "—"
      case "project": return projectTitles[task.project] ?? task.project ?? "—"
      case "assignee": {
        const list = assigneesByTask[task.name] ?? []
        return list.length
          ? list.map((a) => a.member_name || a.member).join(", ")
          : (task.assigned_to || "Unassigned")
      }
      default: return ""
    }
  }, [groupBy, projectTitles, assigneesByTask])

  // Distinct groups present, each mapped to a colour class (the legend).
  const legend = useMemo(() => {
    if (groupBy === "none") return []
    const keys = [...new Set(tasks.map(groupKeyOf))].sort((a, b) => {
      const order = groupBy === "status"
        ? ["Someday", "Backlog", "To Do", "In Progress", "Done", "Blocked"]
        : groupBy === "priority" ? ["Urgent", "High", "Medium", "Low"] : null
      if (order) {
        const ia = order.indexOf(a), ib = order.indexOf(b)
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      }
      if (a === "Unassigned") return 1
      if (b === "Unassigned") return -1
      return a.localeCompare(b)
    })
    return keys.map((key, i) => {
      const fallback = groupBy === "status"
        ? (TASK_STATUS_COLOR[key] ?? GROUP_PALETTE[i % GROUP_PALETTE.length])
        : groupBy === "priority"
          ? (PRIORITY_COLOR[key] ?? GROUP_PALETTE[i % GROUP_PALETTE.length])
          : GROUP_PALETTE[i % GROUP_PALETTE.length]
      // A user-chosen colour always wins over the computed default.
      return { key, color: getColor(groupBy, key) ?? fallback, isCustom: !!getColor(groupBy, key) }
    })
  }, [tasks, groupBy, groupKeyOf, getColor])

  const colorFor = useCallback((task: HiveTask): string => {
    if (groupBy === "none") return TASK_STATUS_COLOR[task.status] ?? "bg-muted-foreground/40"
    const key = groupKeyOf(task)
    return legend.find((l) => l.key === key)?.color ?? "bg-muted-foreground/40"
  }, [groupBy, groupKeyOf, legend])

  // A task occupies every day from its start date to its due date (inclusive).
  // With only one of the two dates it occupies that single day; with neither it
  // goes to the "no dates" tray. YYYY-MM-DD string compare is chronological and
  // timezone-safe (no Date parsing needed).
  const { spans, undated } = useMemo(() => {
    const spans: { task: HiveTask; from: string; to: string }[] = []
    const noDate: HiveTask[] = []
    for (const task of tasks) {
      const start = task.start_date ? task.start_date.slice(0, 10) : null
      const due = task.due_date ? task.due_date.slice(0, 10) : null
      if (!start && !due) {
        noDate.push(task)
        continue
      }
      let from = (start ?? due) as string
      let to = (due ?? start) as string
      if (from > to) [from, to] = [to, from]
      spans.push({ task, from, to })
    }
    return { spans, undated: noDate }
  }, [tasks])

  const dayTasks = useCallback((day: Date) => {
    const key = format(day, "yyyy-MM-dd")
    const list = spans.filter((s) => key >= s.from && key <= s.to).map((s) => s.task)
    if (list.length < 2) return list
    // Apply the user's manual within-day order on top of the date sort.
    const byName = new Map(list.map((t) => [t.name, t]))
    return applyOrder(key, list.map((t) => t.name)).map((n) => byName.get(n)!).filter(Boolean)
  }, [spans, applyOrder])

  const handleDragStart = (event: DragStartEvent) => {
    const name = String(event.active.id).split("|")[1]
    setActiveTask(spans.find((s) => s.task.name === name)?.task ?? null)
  }

  /**
   * Chip ids are "<dayKey>|<taskName>" so we know which day a drag started
   * from — a spanning task appears on several days, and the grabbed day is what
   * determines the shift.
   */
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)
    if (!over) return

    const [fromDay, taskName] = String(active.id).split("|")
    const overId = String(over.id)
    const toDay = overId.startsWith("day:") ? overId.slice(4) : overId.split("|")[0]
    if (!toDay || !taskName) return

    const task = spans.find((s) => s.task.name === taskName)?.task
    if (!task) return

    if (toDay === fromDay) {
      // Reorder within the day: move the dragged chip to the target's position.
      const names = dayTasks(new Date(`${toDay}T00:00:00`)).map((t) => t.name)
      const overName = overId.includes("|") ? overId.split("|")[1] : null
      if (!overName || overName === taskName) return
      const next = names.filter((n) => n !== taskName)
      next.splice(next.indexOf(overName), 0, taskName)
      setDayOrder(toDay, next)
      return
    }

    // Moved to another day: shift the whole span by the same number of days.
    if (!onReschedule) return
    const delta = differenceInCalendarDays(
      new Date(`${toDay}T00:00:00`),
      new Date(`${fromDay}T00:00:00`),
    )
    if (!delta) return
    const shift = (d: string | null) =>
      d ? format(addDays(new Date(`${d.slice(0, 10)}T00:00:00`), delta), "yyyy-MM-dd") : null
    onReschedule(task, shift(task.start_date), shift(task.due_date))
  }

  const goToday = () => setCursor(new Date())
  const goPrev = () =>
    setCursor((c) => (mode === "month" ? subMonths(c, 1) : mode === "week" ? subWeeks(c, 1) : subDays(c, 1)))
  const goNext = () =>
    setCursor((c) => (mode === "month" ? addMonths(c, 1) : mode === "week" ? addWeeks(c, 1) : addDays(c, 1)))

  const title =
    mode === "month"
      ? format(cursor, "MMMM yyyy")
      : mode === "week"
        ? `${format(startOfWeek(cursor, weekOpts), "MMM d")} – ${format(endOfWeek(cursor, weekOpts), "MMM d, yyyy")}`
        : format(cursor, "EEEE, MMM d, yyyy")

  const monthDays = useMemo(
    () => eachDayOfInterval({
      start: startOfWeek(startOfMonth(cursor), weekOpts),
      end: endOfWeek(endOfMonth(cursor), weekOpts),
    }),
    [cursor, weekStartsOn],
  )
  const weekDays = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(cursor, weekOpts), end: endOfWeek(cursor, weekOpts) }),
    [cursor, weekStartsOn],
  )
  // Weekday header row rotated to begin on the chosen start day.
  const orderedWeekdays = useMemo(
    () => [...WEEKDAYS.slice(weekStartsOn), ...WEEKDAYS.slice(0, weekStartsOn)],
    [weekStartsOn],
  )

  const chip = (task: HiveTask, dayKey: string) => (
    <DraggableChip
      key={`${dayKey}|${task.name}`}
      id={`${dayKey}|${task.name}`}
      task={task}
      color={colorFor(task)}
      onClick={() => onTaskClick(task)}
    />
  )

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border p-0.5">
            {MODES.map((m) => (
              <Button
                key={m}
                variant={mode === m ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5 capitalize"
                onClick={() => setMode(m)}
              >
                {m}
              </Button>
            ))}
          </div>
          <Select
            value={String(weekStartsOn)}
            onValueChange={(v) => setWeekStartsOn(Number(v) as typeof weekStartsOn)}
          >
            <SelectTrigger size="sm" className="w-fit" aria-label="Week starts on">
              <span className="hidden text-muted-foreground sm:inline">Week starts:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_NAMES.map((name, i) => (
                <SelectItem key={name} value={String(i)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger size="sm" className="w-fit" aria-label="Group by">
              <span className="hidden text-muted-foreground sm:inline">Group by:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous" onClick={goPrev}>
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next" onClick={goNext}>
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
          </Button>
        </div>
      </div>

      {/* Legend — each entry is a colour picker for that group */}
      {legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border bg-muted/20 px-3 py-2">
          <span className="text-[11px] text-muted-foreground">Tap a colour to change it:</span>
          {legend.map((l) => (
            <Popover key={l.key}>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors hover:bg-accent"
                    title={`Change colour for ${l.key}`}
                  />
                }
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", l.color)} />
                <span className="max-w-[160px] truncate">{l.key}</span>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2">
                <p className="mb-2 max-w-[180px] truncate text-xs font-medium">{l.key}</p>
                <div className="grid grid-cols-8 gap-1">
                  {COLOR_CHOICES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      title={c.label}
                      aria-label={c.label}
                      onClick={() => setColor(groupBy, l.key, c.value)}
                      className={cn(
                        "size-5 rounded-full ring-offset-1 ring-offset-background transition-transform hover:scale-110",
                        c.value,
                        l.color === c.value && "ring-2 ring-foreground",
                      )}
                    />
                  ))}
                </div>
                {l.isCustom && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 w-full text-xs"
                    onClick={() => resetColor(groupBy, l.key)}
                  >
                    Reset to default
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          ))}
        </div>
      )}

      {/* Month + week grids share one drag context: drop a chip on another
          day to reschedule, or onto another chip to reorder within the day. */}
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {/* Month view */}
      {mode === "month" && (
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-7 border-b bg-muted/40">
            {orderedWeekdays.map((d) => (
              <div key={d} className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((day) => {
              const list = dayTasks(day)
              const inMonth = isSameMonth(day, cursor)
              const dayKey = format(day, "yyyy-MM-dd")
              return (
                <DroppableDay
                  key={dayKey}
                  dayKey={dayKey}
                  className={cn(
                    "min-h-[72px] p-1 sm:min-h-[104px] sm:p-1.5 border-b border-r last:border-r-0 [&:nth-child(7n)]:border-r-0",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs",
                        isToday(day) && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {list.slice(0, perDay).map((t) => chip(t, dayKey))}
                    {list.length > perDay && (
                      <div className="px-1.5 text-[11px] text-muted-foreground">+{list.length - perDay}</div>
                    )}
                  </div>
                </DroppableDay>
              )
            })}
          </div>
        </div>
      )}

      {/* Week view */}
      {mode === "week" && (
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-7">
            {weekDays.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd")
              const list = dayTasks(day)
              return (
                <DroppableDay key={dayKey} dayKey={dayKey} className="border-r p-2 last:border-r-0">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{format(day, "EEE")}</span>
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs",
                        isToday(day) && "bg-primary font-semibold text-primary-foreground",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <div className="max-h-[440px] space-y-1 overflow-y-auto">
                    {list.length === 0 ? (
                      <p className="px-1 text-[11px] text-muted-foreground/60">—</p>
                    ) : (
                      list.map((t) => chip(t, dayKey))
                    )}
                  </div>
                </DroppableDay>
              )
            })}
          </div>
        </div>
      )}

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="flex items-center gap-1.5 rounded bg-card px-1.5 py-1 text-xs shadow-lg ring-1 ring-border">
              <span className={cn("size-1.5 shrink-0 rounded-full", colorFor(activeTask))} />
              <span className="truncate">{activeTask.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Day view */}
      {mode === "day" && (
        <div className="rounded-md border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">{format(cursor, "EEEE")}</span>
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-sm",
                isToday(cursor) && "bg-primary font-semibold text-primary-foreground",
              )}
            >
              {format(cursor, "d")}
            </span>
          </div>
          <div className="divide-y">
            {dayTasks(cursor).length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">No tasks on this day.</p>
            ) : (
              dayTasks(cursor).map((task) => (
                <button
                  key={task.name}
                  type="button"
                  onClick={() => onTaskClick(task)}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent"
                >
                  <span className={cn("size-2 shrink-0 rounded-full", colorFor(task))} />
                  <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{task.status}</span>
                  {task.priority && (
                    <Badge variant={TASK_PRIORITY_VARIANT[task.priority] ?? "outline"} className="shrink-0">
                      {task.priority}
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tasks with no due date */}
      {undated.length > 0 && (
        <div className="rounded-md border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">No dates ({undated.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((task) => (
              <button
                key={task.name}
                type="button"
                onClick={() => onTaskClick(task)}
                title={task.title}
                className="flex max-w-[220px] items-center gap-1.5 rounded bg-card px-2 py-1 text-xs shadow-sm ring-1 ring-border transition-colors hover:bg-accent"
              >
                <span className={cn("size-1.5 shrink-0 rounded-full", colorFor(task))} />
                <span className="truncate">{task.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
