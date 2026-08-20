import { useState, Fragment } from "react"
import { format } from "date-fns"
import { useFrappeUpdateDoc } from "frappe-react-sdk"
import { toast } from "sonner"
import { getFrappeErrorMessage } from "@/lib/frappeError"
import {
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type Row,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp01Icon, ArrowDown01Icon, SortingIcon, RepeatIcon, Alert02Icon } from "@hugeicons/core-free-icons"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar"
import { MemberAvatar } from "@/components/MemberAvatar"
import { TASK_PRIORITY_VARIANT, TASK_SIZE_VARIANT, TASK_STATUS_COLOR, PRIORITY_ORDER } from "@/lib/variants"
import { useIsMobile } from "@/hooks/use-mobile"
import { getDueState, DUE_TEXT_CLASS } from "@/lib/dueDate"
import { cn } from "@/lib/utils"
import { TASK_STATUSES } from "@/types"
import type { HiveTask, HiveTaskAssignee } from "@/types"

export interface TaskRow {
  task: HiveTask
  projectTitle: string
  milestoneTitle: string
  assignees: HiveTaskAssignee[]
}

function SortHeader({ label, column }: { label: string; column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc?: boolean) => void } }) {
  const sorted = column.getIsSorted()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sorted === "asc" ? (
        <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} className="ml-1 size-3.5" />
      ) : sorted === "desc" ? (
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="ml-1 size-3.5" />
      ) : (
        <HugeiconsIcon icon={SortingIcon} strokeWidth={2} className="ml-1 size-3.5 opacity-50" />
      )}
    </Button>
  )
}

const selectColumn: ColumnDef<TaskRow> = {
  id: "select",
  enableSorting: false,
  header: ({ table }) => (
    <Checkbox
      aria-label="Select all"
      checked={table.getIsAllRowsSelected()}
      indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
      onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      aria-label="Select row"
      checked={row.getIsSelected()}
      onCheckedChange={(v) => row.toggleSelected(!!v)}
      onClick={(e) => e.stopPropagation()}
    />
  ),
}

const columns: ColumnDef<TaskRow>[] = [
  {
    id: "title",
    accessorFn: (row) => row.task.title,
    header: ({ column }) => <SortHeader label="Task" column={column} />,
    cell: ({ row }) => {
      const { task } = row.original
      return (
        <div className="flex items-center gap-2 min-w-0">
          <span className={`size-2 shrink-0 rounded-full ${TASK_STATUS_COLOR[task.status] ?? "bg-muted-foreground/40"}`} />
          <span className="truncate font-medium">{task.title}</span>
          {task.recurrence_frequency && (
            <HugeiconsIcon
              icon={RepeatIcon}
              strokeWidth={2}
              className="size-3 shrink-0 text-muted-foreground"
            />
          )}
        </div>
      )
    },
  },
  {
    id: "project",
    accessorFn: (row) => row.projectTitle,
    header: ({ column }) => <SortHeader label="Project" column={column} />,
    cell: ({ row }) => (
      <span className="text-muted-foreground truncate">{row.original.projectTitle}</span>
    ),
  },
  {
    id: "status",
    accessorFn: (row) => row.task.status,
    header: ({ column }) => <SortHeader label="Status" column={column} />,
    cell: ({ row }) => (
      <Badge variant="outline" className="text-[10px] h-5 px-1.5">
        {row.original.task.status}
      </Badge>
    ),
  },
  {
    id: "priority",
    accessorFn: (row) => PRIORITY_ORDER[row.task.priority] ?? 99,
    header: ({ column }) => <SortHeader label="Priority" column={column} />,
    cell: ({ row }) => (
      <Badge variant={TASK_PRIORITY_VARIANT[row.original.task.priority] ?? "outline"} className="text-[10px] h-5 px-1.5">
        {row.original.task.priority}
      </Badge>
    ),
  },
  {
    id: "size",
    accessorFn: (row) => row.task.size ?? "",
    header: ({ column }) => <SortHeader label="Size" column={column} />,
    cell: ({ row }) => {
      const size = row.original.task.size
      if (!size) return <span className="text-muted-foreground">-</span>
      return (
        <Badge variant={TASK_SIZE_VARIANT[size] ?? "outline"} className="text-[10px] h-5 px-1.5">
          {size}
        </Badge>
      )
    },
  },
  {
    id: "milestone",
    accessorFn: (row) => row.milestoneTitle,
    header: ({ column }) => <SortHeader label="Milestone" column={column} />,
    cell: ({ row }) => {
      const title = row.original.milestoneTitle
      if (!title) return <span className="text-muted-foreground">-</span>
      return <span className="truncate text-muted-foreground">{title}</span>
    },
  },
  {
    id: "start_date",
    accessorFn: (row) => row.task.start_date || "9999-12-31",
    header: ({ column }) => <SortHeader label="Start Date" column={column} />,
    cell: ({ row }) => {
      const { task } = row.original
      if (!task.start_date) return <span className="text-muted-foreground">-</span>
      return (
        <span className="text-muted-foreground">
          {format(new Date(task.start_date), "MMM d, yyyy")}
        </span>
      )
    },
  },
  {
    id: "due_date",
    accessorFn: (row) => row.task.due_date || "9999-12-31",
    header: ({ column }) => <SortHeader label="Due Date" column={column} />,
    cell: ({ row }) => {
      const { task } = row.original
      if (!task.due_date) return <span className="text-muted-foreground">-</span>
      const state = getDueState(task.due_date, task.status)
      return (
        <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", DUE_TEXT_CLASS[state])}>
          {state === "overdue" && (
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-3.5 shrink-0" />
          )}
          {format(new Date(task.due_date), "MMM d, yyyy")}
          {state === "today" && <span className="text-[10px] font-medium">· Today</span>}
        </span>
      )
    },
  },
  {
    id: "created",
    accessorFn: (row) => row.task.creation ?? "",
    header: ({ column }) => <SortHeader label="Created" column={column} />,
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.task.creation ? format(new Date(row.original.task.creation), "MMM d, yyyy") : "-"}
      </span>
    ),
  },
  {
    id: "assignees",
    header: "Assignees",
    cell: ({ row }) => {
      const { assignees, task } = row.original
      if (assignees.length > 0) {
        return (
          <AvatarGroup>
            {assignees.slice(0, 3).map((a) => (
              <MemberAvatar key={a.member} size="sm" name={a.member_name || a.member} image={a.user_image} />
            ))}
            {assignees.length > 3 && (
              <AvatarGroupCount className="text-[10px]">
                +{assignees.length - 3}
              </AvatarGroupCount>
            )}
          </AvatarGroup>
        )
      }
      if (task.assigned_to) {
        return (
          <MemberAvatar size="sm" name={task.assigned_to.split("@")[0]} />
        )
      }
      return <span className="text-muted-foreground">-</span>
    },
  },
]

type GroupBy = "none" | "status" | "priority" | "project" | "milestone" | "assignee"

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "none", label: "None" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "project", label: "Project" },
  { value: "milestone", label: "Milestone" },
  { value: "assignee", label: "Assignee" },
]

const GROUP_ORDER: Partial<Record<GroupBy, string[]>> = {
  status: [...TASK_STATUSES, "Blocked"],
  priority: ["Urgent", "High", "Medium", "Low"],
}

function groupKeyOf(groupBy: GroupBy, row: TaskRow): string {
  const t = row.task
  switch (groupBy) {
    case "status": return t.status || "—"
    case "priority": return t.priority || "—"
    case "project": return row.projectTitle || t.project || "—"
    case "milestone": return row.milestoneTitle || "No milestone"
    case "assignee":
      return row.assignees.length
        ? row.assignees.map((a) => a.member_name || a.member).join(", ")
        : (t.assigned_to || "Unassigned")
    default: return ""
  }
}

function orderGroupKeys(groupBy: GroupBy, keys: string[]): string[] {
  const order = GROUP_ORDER[groupBy]
  const trailing = ["Unassigned", "No milestone", "—"]
  return [...keys].sort((a, b) => {
    if (order) {
      const ia = order.indexOf(a), ib = order.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    }
    const ta = trailing.includes(a) ? 1 : 0
    const tb = trailing.includes(b) ? 1 : 0
    return ta - tb || a.localeCompare(b)
  })
}

interface TaskListTableProps {
  data: TaskRow[]
  onRowClick: (task: HiveTask) => void
  /** Extra text appended after the "N tasks" count (e.g. " matching filters"). */
  countNote?: string
  /** Hide the Project column (redundant inside a single project's view). */
  hideProjectColumn?: boolean
  /** Called after a bulk action changes data, so the parent can refetch. */
  onChanged?: () => void
}

/**
 * Sortable, paginated task table shared by the Tasks page and the per-project
 * Tasks tab. Supports multi-select (bulk set-status / archive) and Group by.
 */
export function TaskListTable({ data, onRowClick, countNote = "", hideProjectColumn = false, onChanged }: TaskListTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "due_date", desc: false }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [groupBy, setGroupBy] = useState<GroupBy>("none")
  const { updateDoc } = useFrappeUpdateDoc()
  const isMobile = useIsMobile()

  const activeColumns = [
    selectColumn,
    ...(hideProjectColumn ? columns.filter((c) => c.id !== "project") : columns),
  ]

  const table = useReactTable({
    data,
    columns: activeColumns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => row.task.name,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  const colCount = activeColumns.length
  const selectedRows = table.getSelectedRowModel().rows
  const selectedCount = selectedRows.length

  const runBulk = async (label: string, updates: Partial<HiveTask>, undo?: Partial<HiveTask>) => {
    const tasks = selectedRows.map((r) => r.original.task)
    try {
      await Promise.all(tasks.map((t) => updateDoc("Hive Task", t.name, updates)))
      table.resetRowSelection()
      onChanged?.()
      toast.success(`${label} ${tasks.length} task${tasks.length !== 1 ? "s" : ""}`, undo ? {
        action: {
          label: "Undo",
          onClick: async () => {
            await Promise.all(tasks.map((t) => updateDoc("Hive Task", t.name, undo)))
            onChanged?.()
          },
        },
        duration: 6000,
      } : undefined)
    } catch (err) {
      // Partial failures land here too (e.g. one task blocked by its checklist);
      // refetch so the rows that did save aren't shown stale.
      onChanged?.()
      toast.error(getFrappeErrorMessage(err, "Bulk action failed"))
    }
  }

  /**
   * Phones get cards instead of the 10-column table — a horizontally scrolling
   * table is unusable at that width. Same data, stacked and tappable.
   */
  const renderCard = (row: Row<TaskRow>) => {
    const { task, projectTitle, assignees } = row.original
    const dueState = getDueState(task.due_date, task.status)
    return (
      <li
        key={row.id}
        data-state={row.getIsSelected() ? "selected" : undefined}
        className="flex gap-3 border-b p-3 last:border-b-0 data-[state=selected]:bg-muted/50"
        onClick={() => onRowClick(task)}
      >
        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            aria-label={`Select ${task.title}`}
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TASK_STATUS_COLOR[task.status] ?? "bg-muted-foreground/40"}`} />
            <span className="min-w-0 flex-1 break-words text-sm font-medium">{task.title}</span>
            {dueState === "overdue" && (
              <HugeiconsIcon
                icon={Alert02Icon}
                strokeWidth={2}
                className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-400"
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pl-4">
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{task.status}</Badge>
            {task.priority && (
              <Badge variant={TASK_PRIORITY_VARIANT[task.priority] ?? "outline"} className="h-5 px-1.5 text-[10px]">
                {task.priority}
              </Badge>
            )}
            {!hideProjectColumn && projectTitle && (
              <span className="truncate text-xs text-muted-foreground">{projectTitle}</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 pl-4">
            <span className={cn("text-xs", DUE_TEXT_CLASS[dueState])}>
              {task.due_date ? format(new Date(task.due_date), "MMM d, yyyy") : "No due date"}
              {dueState === "today" && " · Today"}
              {dueState === "overdue" && " · Overdue"}
            </span>
            {assignees.length > 0 && (
              <AvatarGroup>
                {assignees.slice(0, 3).map((a) => (
                  <MemberAvatar key={a.member} size="sm" name={a.member_name || a.member} image={a.user_image} />
                ))}
                {assignees.length > 3 && (
                  <AvatarGroupCount className="text-[10px]">+{assignees.length - 3}</AvatarGroupCount>
                )}
              </AvatarGroup>
            )}
          </div>
        </div>
      </li>
    )
  }

  const renderRow = (row: Row<TaskRow>) => (
    <TableRow
      key={row.id}
      data-state={row.getIsSelected() ? "selected" : undefined}
      className="cursor-pointer data-[state=selected]:bg-muted/50"
      onClick={() => onRowClick(row.original.task)}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  )

  // Grouped rows (all sorted rows, no pagination), keyed + ordered.
  const groupedSections = (() => {
    if (groupBy === "none") return null
    const rows = table.getSortedRowModel().rows
    const map = new Map<string, Row<TaskRow>[]>()
    for (const r of rows) {
      const k = groupKeyOf(groupBy, r.original)
      const arr = map.get(k) ?? []
      arr.push(r)
      map.set(k, arr)
    }
    return orderGroupKeys(groupBy, [...map.keys()]).map((k) => ({ key: k, rows: map.get(k)! }))
  })()

  return (
    <div className="space-y-3">
      {/* Toolbar: Group by + bulk actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Group by:</span>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{selectedCount} selected</span>
            <Select value="" onValueChange={(v) => runBulk("Updated", { status: v as HiveTask["status"] }, undefined)}>
              <SelectTrigger size="sm" className="w-36">
                <span className="text-muted-foreground">Set status…</span>
              </SelectTrigger>
              <SelectContent>
                {[...TASK_STATUSES, "Blocked"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => runBulk("Archived", { is_archived: 1 }, { is_archived: 0 })}>
              Archive
            </Button>
            <Button variant="ghost" size="sm" onClick={() => table.resetRowSelection()}>
              Clear
            </Button>
          </div>
        )}
      </div>

      {isMobile ? (
        <div className="overflow-hidden rounded-md border">
          {groupedSections ? (
            groupedSections.map((section) => {
              const allSel = section.rows.every((r) => r.getIsSelected())
              const someSel = section.rows.some((r) => r.getIsSelected())
              return (
                <Fragment key={`m-group-${section.key}`}>
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
                    <Checkbox
                      aria-label={`Select group ${section.key}`}
                      checked={allSel}
                      indeterminate={someSel && !allSel}
                      onCheckedChange={(v) => section.rows.forEach((r) => r.toggleSelected(!!v))}
                    />
                    <span className="text-xs font-semibold">{section.key}</span>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{section.rows.length}</Badge>
                  </div>
                  <ul>{section.rows.map(renderCard)}</ul>
                </Fragment>
              )
            })
          ) : (
            <ul>{table.getRowModel().rows.map(renderCard)}</ul>
          )}
        </div>
      ) : (
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {groupedSections
              ? groupedSections.map((section) => {
                  const allSel = section.rows.every((r) => r.getIsSelected())
                  const someSel = section.rows.some((r) => r.getIsSelected())
                  return (
                    <Fragment key={`group-${section.key}`}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={colCount} className="py-1.5">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              aria-label={`Select group ${section.key}`}
                              checked={allSel}
                              indeterminate={someSel && !allSel}
                              onCheckedChange={(v) => section.rows.forEach((r) => r.toggleSelected(!!v))}
                            />
                            <span className="text-xs font-semibold">{section.key}</span>
                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{section.rows.length}</Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                      {section.rows.map(renderRow)}
                    </Fragment>
                  )
                })
              : table.getRowModel().rows.map(renderRow)}
          </TableBody>
        </Table>
      </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {data.length} task{data.length !== 1 ? "s" : ""}{countNote}
        </p>
        {groupBy === "none" && table.getPageCount() > 1 && (
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
