import { useCallback, useMemo, useState } from "react"
import {
  addDays,
  addMonths,
  addWeeks,
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
import { cn } from "@/lib/utils"
import { TASK_STATUS_COLOR, TASK_PRIORITY_VARIANT } from "@/lib/variants"
import { useWeekStart } from "@/hooks/useWeekStart"
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
}: TaskCalendarProps) {
  const [mode, setMode] = useState<CalendarMode>("month")
  const [cursor, setCursor] = useState<Date>(() => new Date())
  const [weekStartsOn, setWeekStartsOn] = useWeekStart()
  const [groupBy, setGroupBy] = useState<GroupBy>("none")
  const weekOpts = { weekStartsOn } as const

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
    return keys.map((key, i) => ({
      key,
      color: groupBy === "status"
        ? (TASK_STATUS_COLOR[key] ?? GROUP_PALETTE[i % GROUP_PALETTE.length])
        : groupBy === "priority"
          ? (PRIORITY_COLOR[key] ?? GROUP_PALETTE[i % GROUP_PALETTE.length])
          : GROUP_PALETTE[i % GROUP_PALETTE.length],
    }))
  }, [tasks, groupBy, groupKeyOf])

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

  const dayTasks = (day: Date) => {
    const key = format(day, "yyyy-MM-dd")
    return spans.filter((s) => key >= s.from && key <= s.to).map((s) => s.task)
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

  const chip = (task: HiveTask) => (
    <button
      key={task.name}
      type="button"
      onClick={() => onTaskClick(task)}
      title={task.title}
      className="flex w-full items-center gap-1.5 rounded bg-card px-1.5 py-1 text-left text-xs shadow-sm ring-1 ring-border transition-colors hover:bg-accent"
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", colorFor(task))} />
      <span className="truncate">{task.title}</span>
    </button>
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
              <span className="text-muted-foreground">Week starts:</span>
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
              <span className="text-muted-foreground">Group by:</span>
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

      {/* Legend for the active grouping */}
      {legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border bg-muted/20 px-3 py-2">
          {legend.map((l) => (
            <span key={l.key} className="flex items-center gap-1.5 text-xs">
              <span className={cn("size-2.5 shrink-0 rounded-full", l.color)} />
              <span className="truncate max-w-[160px]">{l.key}</span>
            </span>
          ))}
        </div>
      )}

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
              return (
                <div
                  key={format(day, "yyyy-MM-dd")}
                  className={cn(
                    "min-h-[104px] border-b border-r p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0",
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
                    {list.slice(0, maxPerDay).map(chip)}
                    {list.length > maxPerDay && (
                      <div className="px-1.5 text-[11px] text-muted-foreground">+{list.length - maxPerDay} more</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Week view */}
      {mode === "week" && (
        <div className="overflow-hidden rounded-md border">
          <div className="grid grid-cols-7">
            {weekDays.map((day) => (
              <div key={format(day, "yyyy-MM-dd")} className="border-r p-2 last:border-r-0">
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
                  {dayTasks(day).length === 0 ? (
                    <p className="px-1 text-[11px] text-muted-foreground/60">—</p>
                  ) : (
                    dayTasks(day).map(chip)
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
