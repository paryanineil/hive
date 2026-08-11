import { useState, useMemo, useEffect, useCallback } from "react"
import { useFrappeGetDocList, useFrappeGetDoc, useFrappePostCall, useFrappeCreateDoc, useFrappeUpdateDoc, useSWRConfig } from "frappe-react-sdk"
import { useNavigate, useSearchParams, Link } from "react-router"
import { toast } from "sonner"
import { LazyEmojiPicker } from "@/components/LazyEmojiPicker"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  TaskDaily01Icon,
  Search01Icon,
  FilterIcon,
  Add01Icon,
  LeftToRightListBulletIcon,
  DashboardSquare01Icon,
  Calendar01Icon,
  ChartBarLineIcon,
  FloppyDiskIcon,
  MoreHorizontalIcon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { MultiSelect } from "@/components/MultiSelect"
import { TASK_STATUSES, TASK_PRIORITIES, type HiveTask, type HiveProject, type HiveMilestone, type HiveTaskAssignee, type HiveMember, type HiveView } from "@/types"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { useTheme } from "@/components/theme-provider"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { CreateTaskDialog } from "@/components/CreateTaskDialog"
import { TaskKanban } from "@/components/TaskKanban"
import { TaskCalendar } from "@/components/TaskCalendar"
import { TaskTimeline } from "@/components/TaskTimeline"
import { TaskListTable, type TaskRow } from "@/components/TaskListTable"
import { TaskDetailSheet } from "@/components/TaskDetailSheet"
import { usePinnedTasks } from "@/context/PinnedTasksContext"
import { useCelebration } from "@/hooks/useTaskCelebration"
import { useShowCompleted } from "@/hooks/useShowCompleted"
import { getDueState } from "@/lib/dueDate"


const EMPTY_ASSIGNEES: Record<string, HiveTaskAssignee[]> = {}



export function TasksPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const viewId = searchParams.get("view_id") ?? ""
  const search = searchParams.get("q") ?? ""
  const statusParam = searchParams.get("status") ?? ""
  const priorityParam = searchParams.get("priority") ?? ""
  const projectParam = searchParams.get("project") ?? ""
  const assigneeParam = searchParams.get("assignee") ?? ""
  const dueParam = searchParams.get("due") ?? ""
  const statusValues = statusParam ? statusParam.split(",") : []
  const priorityValues = priorityParam ? priorityParam.split(",") : []
  const projectValues = projectParam ? projectParam.split(",") : []
  const assigneeValues = assigneeParam ? assigneeParam.split(",") : []
  const viewMode = (searchParams.get("view") ?? "list") as "list" | "kanban" | "calendar" | "timeline"

  const { data: activeView } = useFrappeGetDoc<HiveView>(
    "Hive View",
    viewId || null,
  )

  const setFilter = useCallback((key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === "all" || value === "") {
        next.delete(key)
      } else {
        next.set(key, value)
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setMultiFilter = useCallback((key: string, values: string[]) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!values.length) next.delete(key)
      else next.set(key, values.join(","))
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSearch = useCallback((value: string) => setFilter("q", value), [setFilter])
  const setStatusValues = useCallback((v: string[]) => setMultiFilter("status", v), [setMultiFilter])
  const setPriorityValues = useCallback((v: string[]) => setMultiFilter("priority", v), [setMultiFilter])
  const setProjectValues = useCallback((v: string[]) => setMultiFilter("project", v), [setMultiFilter])
  const setAssigneeValues = useCallback((v: string[]) => setMultiFilter("assignee", v), [setMultiFilter])
  const setViewMode = useCallback((value: string) => setFilter("view", value === "list" ? "" : value), [setFilter])

  const [createOpen, setCreateOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<HiveTask | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saveViewOpen, setSaveViewOpen] = useState(false)
  const [saveViewLabel, setSaveViewLabel] = useState("")
  const [saveViewEmoji, setSaveViewEmoji] = useState("")
  const [saveViewPublic, setSaveViewPublic] = useState(false)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const { createDoc } = useFrappeCreateDoc()
  const { updateDoc } = useFrappeUpdateDoc()
  const { mutate: globalMutate } = useSWRConfig()
  const { resolvedTheme } = useTheme()
  const { celebrate } = useCelebration()
  const { pinnedTaskNames, togglePin, isPinned } = usePinnedTasks()
  const [showCompleted, toggleShowCompleted] = useShowCompleted()

  const { data: tasks, isLoading: tasksLoading, mutate: tasksMutate } = useFrappeGetDocList<HiveTask>(
    "Hive Task",
    {
      fields: [
        "name", "title", "project", "status", "priority", "size", "milestone",
        "depends_on", "assigned_to", "is_internal", "description", "start_date", "due_date", "pr_link",
        "completed_on", "uat_status", "recurrence_frequency", "recurrence_end_date", "creation", "modified",
      ],
      filters: [["is_archived", "=", 0]],
      orderBy: { field: "due_date", order: "asc" },
      limit: 500,
    },
  )

  const { data: projects } = useFrappeGetDocList<HiveProject>(
    "Hive Project",
    {
      fields: ["name", "title"],
      limit: 100,
    },
  )

  const { data: members } = useFrappeGetDocList<HiveMember>(
    "Hive Member",
    {
      fields: ["name", "member_name"],
      filters: [["is_active", "=", 1]],
      limit: 200,
    },
  )

  const { data: milestones } = useFrappeGetDocList<HiveMilestone>(
    "Hive Milestone",
    {
      fields: ["name", "title"],
      limit: 500,
    },
  )

  const { call: callAssignees, result: assigneesResult } = useFrappePostCall<{
    message: Record<string, HiveTaskAssignee[]>
  }>("bwh_hive.bwh_hive.api.get_task_assignees")

  useEffect(() => {
    callAssignees({})
  }, [callAssignees])

  const assigneesByTask = (assigneesResult?.message ?? EMPTY_ASSIGNEES) as Record<string, HiveTaskAssignee[]>

  const { call: callAssign } = useFrappePostCall("frappe.desk.form.assign_to.add")

  const handleCreateTask = useCallback(async (values: {
    title: string; priority: string; status: string;
    due_date?: string | null; start_date?: string | null;
    is_internal?: 0 | 1; _assign_users?: string[];
    project?: string; milestone?: string | null;
    recurrence_frequency?: string | null;
    recurrence_end_date?: string | null;
  }) => {
    const { _assign_users, ...taskValues } = values
    let doc
    try {
      doc = await createDoc("Hive Task", taskValues)
    } catch {
      toast.error("Failed to create task")
      return
    }
    setCreateOpen(false)
    toast.success("Task created")
    if (_assign_users?.length) {
      try {
        await callAssign({ doctype: "Hive Task", name: doc.name, assign_to: _assign_users })
      } catch {
        toast.error("Task created, but failed to assign users")
      }
    }
    tasksMutate()
    callAssignees({})
  }, [createDoc, callAssign, callAssignees, tasksMutate])

  const buildCurrentFilters = useCallback(() => {
    const filters: Record<string, string> = {}
    if (statusParam) filters.status = statusParam
    if (priorityParam) filters.priority = priorityParam
    if (projectParam) filters.project = projectParam
    if (assigneeParam) filters.assignee = assigneeParam
    if (search) filters.q = search
    return filters
  }, [statusParam, priorityParam, projectParam, assigneeParam, search])

  const handleSaveView = useCallback(async () => {
    if (!saveViewLabel.trim()) return
    const filters = buildCurrentFilters()
    try {
      const doc = await createDoc("Hive View", {
        label: saveViewLabel.trim(),
        emoji: saveViewEmoji || "",
        view_type: viewMode,
        filters_json: JSON.stringify(filters),
        is_public: saveViewPublic ? 1 : 0,
      })
      toast.success("View saved")
      setSaveViewOpen(false)
      setSaveViewLabel("")
      setSaveViewEmoji("")
      setSaveViewPublic(false)
      // Revalidate sidebar views
      globalMutate((key: unknown) => typeof key === "string" && key.includes("Hive View"), undefined, { revalidate: true })
      // Navigate to the newly created view
      const params = new URLSearchParams()
      params.set("view_id", doc.name)
      for (const [k, v] of Object.entries(filters)) {
        if (v) params.set(k, v)
      }
      if (viewMode !== "list") params.set("view", viewMode)
      navigate(`/tasks?${params.toString()}`, { replace: true })
    } catch {
      toast.error("Failed to save view")
    }
  }, [saveViewLabel, saveViewEmoji, saveViewPublic, viewMode, buildCurrentFilters, createDoc, globalMutate, navigate])

  const handleSaveViewChanges = useCallback(async () => {
    if (!activeView) return
    const filters = buildCurrentFilters()
    try {
      await updateDoc("Hive View", activeView.name, {
        filters_json: JSON.stringify(filters),
        view_type: viewMode,
      })
      toast.success("View updated")
      globalMutate((key: unknown) => typeof key === "string" && key.includes("Hive View"), undefined, { revalidate: true })
    } catch {
      toast.error("Failed to update view")
    }
  }, [activeView, viewMode, buildCurrentFilters, updateDoc, globalMutate])

  const projectMap = useMemo(() => {
    const map: Record<string, string> = {}
    if (projects) {
      for (const p of projects) {
        map[p.name] = p.title
      }
    }
    return map
  }, [projects])

  const milestoneMap = useMemo(() => {
    const map: Record<string, string> = {}
    if (milestones) {
      for (const m of milestones) {
        map[m.name] = m.title
      }
    }
    return map
  }, [milestones])

  // Shared filter function used by both list and kanban views
  const filteredTasks = useMemo(() => {
    if (!tasks) return []
    const statusV = statusParam ? statusParam.split(",") : []
    const priorityV = priorityParam ? priorityParam.split(",") : []
    const projectV = projectParam ? projectParam.split(",") : []
    const assigneeV = assigneeParam ? assigneeParam.split(",") : []
    return tasks.filter((task) => {
      // Completed (Done) tasks are hidden across all views unless the user opts
      // in — or explicitly filters for them, e.g. the Completed smart list.
      if (!showCompleted && task.status === "Done" && !statusV.includes("Done")) return false
      // Smart-list due filters (?due=today|overdue|planned).
      if (dueParam) {
        const state = getDueState(task.due_date, task.status)
        if (dueParam === "today" && state !== "today") return false
        if (dueParam === "overdue" && state !== "overdue") return false
        if (dueParam === "planned" && !task.due_date) return false
      }
      if (search) {
        const q = search.toLowerCase()
        const matchName = task.name.toLowerCase().includes(q)
        const matchTitle = task.title.toLowerCase().includes(q)
        const matchProject = (projectMap[task.project] ?? task.project).toLowerCase().includes(q)
        const matchAssignee = (task.assigned_to ?? "").toLowerCase().includes(q)
        if (!matchName && !matchTitle && !matchProject && !matchAssignee) return false
      }
      if (statusV.length && !statusV.includes(task.status)) return false
      if (priorityV.length && !priorityV.includes(task.priority)) return false
      if (projectV.length && !projectV.includes(task.project)) return false
      if (assigneeV.length) {
        const taskAssignees = assigneesByTask[task.name] ?? []
        if (!taskAssignees.some((a) => assigneeV.includes(a.member))) return false
      }
      return true
    })
  }, [tasks, showCompleted, search, statusParam, priorityParam, projectParam, assigneeParam, dueParam, projectMap, assigneesByTask])

  // Count of completed tasks currently hidden (respects other active filters except the Done hide itself).
  const completedCount = useMemo(
    () => (tasks ?? []).filter((t) => t.status === "Done").length,
    [tasks],
  )

  // Group filtered tasks by status for kanban view, sorted by due date ascending (nulls last).
  // Done visibility is governed by the "Show completed" toggle via filteredTasks.
  const tasksByStatus = useMemo(() => {
    const grouped: Record<string, HiveTask[]> = {}
    for (const status of TASK_STATUSES) {
      grouped[status] = []
    }
    for (const task of filteredTasks) {
      if (grouped[task.status]) {
        grouped[task.status].push(task)
      }
    }
    for (const status of TASK_STATUSES) {
      grouped[status].sort((a, b) => {
        const da = a.due_date || "9999-12-31"
        const db = b.due_date || "9999-12-31"
        return da < db ? -1 : da > db ? 1 : 0
      })
    }
    return grouped
  }, [filteredTasks])

  const handleStatusChange = useCallback(async (taskName: string, newStatus: string) => {
    const today = new Date().toISOString().split("T")[0]
    const optimistic = (current: HiveTask[] | undefined) =>
      current?.map((t) =>
        t.name === taskName ? {
          ...t,
          status: newStatus as HiveTask["status"],
          completed_on: newStatus === "Done" ? (t.completed_on || today) : null,
        } : t
      )
    try {
      await tasksMutate(
        async (current) => {
          await updateDoc("Hive Task", taskName, { status: newStatus })
          return optimistic(current)
        },
        { optimisticData: optimistic, rollbackOnError: true, revalidate: true },
      )
      if (newStatus === "Done") celebrate()
    } catch {
      toast.error("Failed to update task status")
    }
  }, [updateDoc, tasksMutate, celebrate])

  // Dragging a task onto another calendar day shifts its whole span.
  const handleReschedule = useCallback(async (
    task: HiveTask, startDate: string | null, dueDate: string | null,
  ) => {
    try {
      await updateDoc("Hive Task", task.name, { start_date: startDate, due_date: dueDate })
      tasksMutate()
    } catch {
      toast.error("Failed to move task")
    }
  }, [updateDoc, tasksMutate])

  const handleTaskClick = useCallback((task: HiveTask) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    setSelectedTask(task)
    setSheetOpen(true)
  }, [])

  const handleSheetOpenChange = useCallback((open: boolean) => {
    setSheetOpen(open)
    if (!open) setSelectedTask(null)
  }, [])

  const handleTaskUpdated = useCallback(() => {
    tasksMutate()
    callAssignees({})
  }, [tasksMutate, callAssignees])

  const tableData = useMemo<TaskRow[]>(
    () => filteredTasks.map((task) => ({
      task,
      projectTitle: projectMap[task.project] ?? task.project,
      milestoneTitle: task.milestone ? (milestoneMap[task.milestone] ?? "") : "",
      assignees: assigneesByTask[task.name] ?? [],
    })),
    [filteredTasks, projectMap, milestoneMap, assigneesByTask],
  )


  const activeFilterCount = [statusValues, priorityValues, projectValues, assigneeValues].filter((a) => a.length).length

  /** Drop every filter (and the search box) in one go, keeping the current view. */
  const clearAllFilters = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const key of ["status", "priority", "project", "assignee", "q", "due"]) next.delete(key)
      return next
    }, { replace: true })
  }, [setSearchParams])
  const hasActiveFilters = !!(search || activeFilterCount)

  // Detect if the user has modified filters or view type from the saved view's originals
  const viewFiltersModified = useMemo(() => {
    if (!activeView) return false
    // Check view type change (list vs kanban)
    const savedViewType = activeView.view_type || "list"
    if (viewMode !== savedViewType) return true
    // Check filter changes
    const saved: Record<string, string> = (() => {
      try { return JSON.parse(activeView.filters_json || "{}") } catch { return {} }
    })()
    const current: Record<string, string> = {}
    if (statusParam) current.status = statusParam
    if (priorityParam) current.priority = priorityParam
    if (projectParam) current.project = projectParam
    if (assigneeParam) current.assignee = assigneeParam
    if (search) current.q = search
    const savedKeys = Object.keys(saved).sort()
    const currentKeys = Object.keys(current).sort()
    if (savedKeys.length !== currentKeys.length) return true
    return savedKeys.some((k, i) => currentKeys[i] !== k || saved[k] !== current[k])
  }, [activeView, statusParam, priorityParam, projectParam, assigneeParam, search, viewMode])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {activeView ? (
            <>
              <Breadcrumb className="mb-2">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink render={<Link to="/tasks" />}>
                      Tasks
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{activeView.label}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 truncate">
                {activeView.emoji && <span className="text-xl">{activeView.emoji}</span>}
                <span className="truncate">{activeView.label}</span>
              </h1>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
              <p className="mt-1 text-muted-foreground">
                All tasks across your projects.
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center rounded-md border p-0.5">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("list")}
            >
              <HugeiconsIcon icon={LeftToRightListBulletIcon} strokeWidth={2} className="size-4" />
            </Button>
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewMode("kanban")}
            >
              <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} className="size-4" />
            </Button>
            <Button
              variant={viewMode === "calendar" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              aria-label="Calendar view"
              onClick={() => setViewMode("calendar")}
            >
              <HugeiconsIcon icon={Calendar01Icon} strokeWidth={2} className="size-4" />
            </Button>
            <Button
              variant={viewMode === "timeline" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              aria-label="Timeline view"
              onClick={() => setViewMode("timeline")}
            >
              <HugeiconsIcon icon={ChartBarLineIcon} strokeWidth={2} className="size-4" />
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" className="h-8 w-8" aria-label="View actions" />}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {activeView && viewFiltersModified ? (
                <>
                  <DropdownMenuItem onClick={handleSaveViewChanges}>
                    <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} />
                    Save Changes
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSaveViewOpen(true)}>
                    Save as New View
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={() => setSaveViewOpen(true)}>
                  <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} />
                  Save View
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setCreateOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            <span className="hidden sm:inline">Add Task</span>
          </Button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
          />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeFilterCount > 0 && (
            <>
              <Badge variant="secondary" className="gap-1">
                <HugeiconsIcon icon={FilterIcon} strokeWidth={2} className="size-3" />
                {activeFilterCount}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
                title="Clear all filters"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                Clear all
              </Button>
            </>
          )}
          <MultiSelect
            label="Status:"
            options={[...TASK_STATUSES, "Blocked"].map((s) => ({ value: s, label: s }))}
            selected={statusValues}
            onChange={setStatusValues}
            searchable={false}
          />
          <MultiSelect
            label="Priority:"
            options={TASK_PRIORITIES.map((p) => ({ value: p, label: p }))}
            selected={priorityValues}
            onChange={setPriorityValues}
            searchable={false}
          />
          <MultiSelect
            label="Project:"
            options={(projects ?? []).map((p) => ({ value: p.name, label: p.title || p.name }))}
            selected={projectValues}
            onChange={setProjectValues}
            searchPlaceholder="Search project..."
          />
          <MultiSelect
            label="Assignee:"
            options={(members ?? []).map((m) => ({ value: m.name, label: m.member_name || m.name }))}
            selected={assigneeValues}
            onChange={setAssigneeValues}
            searchPlaceholder="Search member..."
          />
          <Button
            variant={showCompleted ? "secondary" : "outline"}
            onClick={toggleShowCompleted}
            className="gap-1.5"
            aria-pressed={showCompleted}
            title={showCompleted ? "Hide completed tasks" : "Show completed tasks"}
          >
            <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-4" />
            {showCompleted
              ? "Hide completed"
              : `Show completed${completedCount ? ` (${completedCount})` : ""}`}
          </Button>
        </div>
      </div>

      {/* Data View */}
      {tasksLoading ? (
        viewMode === "kanban" ? (
          <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="min-w-[220px] space-y-3 md:min-w-0">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {["Task", "Project", "Status", "Priority", "Size", "Milestone", "Start Date", "Due Date", "Assignees"].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="size-6 rounded-full" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )
      ) : filteredTasks.length === 0 ? (
        <Empty className="border rounded-2xl p-12">
          <EmptyHeader>
            <EmptyMedia>
              <HugeiconsIcon icon={TaskDaily01Icon} strokeWidth={1.5} className="size-10 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>
              {hasActiveFilters
                ? "No tasks match your filters"
                : "No tasks yet"}
            </EmptyTitle>
            <EmptyDescription>
              {hasActiveFilters
                ? "Try adjusting your search or filters."
                : "Tasks will appear here once created in a project."}
            </EmptyDescription>
          </EmptyHeader>
          {!(hasActiveFilters) && (
            <Button onClick={() => setCreateOpen(true)} className="mt-4">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Add Task
            </Button>
          )}
        </Empty>
      ) : viewMode === "kanban" ? (
        <div className="space-y-2">
          <TaskKanban
            tasksByStatus={tasksByStatus}
            onStatusChange={handleStatusChange}
            onTaskClick={handleTaskClick}
            assigneesByTask={assigneesByTask}
            pinnedTaskNames={pinnedTaskNames}
            onTogglePin={togglePin}
          />
          <p className="text-xs text-muted-foreground">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
            {(hasActiveFilters) && " matching filters"}
          </p>
        </div>
      ) : viewMode === "calendar" ? (
        <div className="space-y-2">
          <TaskCalendar
            tasks={filteredTasks}
            onTaskClick={handleTaskClick}
            projectTitles={projectMap}
            assigneesByTask={assigneesByTask}
            onReschedule={handleReschedule}
          />
          <p className="text-xs text-muted-foreground">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
            {(hasActiveFilters) && " matching filters"}
          </p>
        </div>
      ) : viewMode === "timeline" ? (
        <div className="space-y-2">
          <TaskTimeline tasks={filteredTasks} projectTitles={projectMap} onTaskClick={handleTaskClick} />
          <p className="text-xs text-muted-foreground">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
            {(hasActiveFilters) && " matching filters"}
          </p>
        </div>
      ) : (
        <TaskListTable
          data={tableData}
          onRowClick={(task) => navigate(`/projects/${task.project}?tab=tasks&task=${task.name}`)}
          countNote={(hasActiveFilters) ? " matching filters" : ""}
          onChanged={() => { tasksMutate(); callAssignees({}) }}
        />
      )}

      <TaskDetailSheet
        task={selectedTask}
        open={sheetOpen}
        onOpenChange={handleSheetOpenChange}
        onUpdated={handleTaskUpdated}
        isPinned={selectedTask ? isPinned(selectedTask.name) : false}
        onTogglePin={togglePin}
        initialAssignees={selectedTask ? assigneesByTask[selectedTask.name] : undefined}
      />

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreateTask}
      />

      <Dialog open={saveViewOpen} onOpenChange={(open) => {
        setSaveViewOpen(open)
        if (!open) {
          setSaveViewLabel("")
          setSaveViewEmoji("")
          setSaveViewPublic(false)
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <div>
                <Label>Emoji</Label>
                <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className="mt-1.5 flex h-9 w-16 items-center justify-center rounded-md border border-input bg-background text-lg hover:bg-accent transition-colors"
                      >
                        {saveViewEmoji || "📋"}
                      </button>
                    }
                  />
                  <PopoverContent className="w-auto p-0" side="bottom" align="start">
                    <LazyEmojiPicker
                      onEmojiClick={(emojiData) => {
                        setSaveViewEmoji(emojiData.emoji)
                        setEmojiPickerOpen(false)
                      }}
                      theme={resolvedTheme === "dark" ? "dark" : "light"}
                      skinTonesDisabled
                      height={400}
                      width={350}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex-1">
                <Label htmlFor="save-view-label">Name</Label>
                <Input
                  id="save-view-label"
                  value={saveViewLabel}
                  onChange={(e) => setSaveViewLabel(e.target.value)}
                  placeholder="My urgent tasks"
                  className="mt-1.5"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && saveViewLabel.trim()) handleSaveView()
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="save-view-public"
                checked={saveViewPublic}
                onCheckedChange={(checked) => setSaveViewPublic(checked === true)}
              />
              <Label htmlFor="save-view-public" className="text-sm font-normal">
                Public — visible to all team members
              </Label>
            </div>
            {hasActiveFilters && (
              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Current filters:</p>
                {search && <p>Search: {search}</p>}
                {statusValues.length > 0 && <p>Status: {statusValues.join(", ")}</p>}
                {priorityValues.length > 0 && <p>Priority: {priorityValues.join(", ")}</p>}
                {projectValues.length > 0 && <p>Project: {projectValues.map((v) => projectMap[v] ?? v).join(", ")}</p>}
                {assigneeValues.length > 0 && <p>Assignee: {assigneeValues.map((v) => members?.find((m) => m.name === v)?.member_name ?? v).join(", ")}</p>}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              View type: {viewMode === "kanban" ? "Kanban" : viewMode === "calendar" ? "Calendar" : viewMode === "timeline" ? "Timeline" : "List"}
            </p>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button onClick={handleSaveView} disabled={!saveViewLabel.trim()}>
              Save View
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
