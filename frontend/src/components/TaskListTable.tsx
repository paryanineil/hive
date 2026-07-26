import { useState } from "react"
import { format } from "date-fns"
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowUp01Icon, ArrowDown01Icon, SortingIcon, RepeatIcon } from "@hugeicons/core-free-icons"
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
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar"
import { MemberAvatar } from "@/components/MemberAvatar"
import { TASK_PRIORITY_VARIANT, TASK_SIZE_VARIANT, TASK_STATUS_COLOR, PRIORITY_ORDER } from "@/lib/variants"
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
              title={`Recurs ${task.recurrence_frequency}`}
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
      const isOverdue = new Date(task.due_date) < new Date() && task.status !== "Done" && task.status !== "Someday"
      return (
        <span className={isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}>
          {format(new Date(task.due_date), "MMM d, yyyy")}
        </span>
      )
    },
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

interface TaskListTableProps {
  data: TaskRow[]
  onRowClick: (task: HiveTask) => void
  /** Extra text appended after the "N tasks" count (e.g. " matching filters"). */
  countNote?: string
  /** Hide the Project column (redundant inside a single project's view). */
  hideProjectColumn?: boolean
}

/**
 * Sortable, paginated task table shared by the Tasks page and the per-project
 * Tasks tab. Row click is delegated to the parent via `onRowClick`.
 */
export function TaskListTable({ data, onRowClick, countNote = "", hideProjectColumn = false }: TaskListTableProps) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "due_date", desc: false }])
  const activeColumns = hideProjectColumn ? columns.filter((c) => c.id !== "project") : columns

  const table = useReactTable({
    data,
    columns: activeColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
  })

  return (
    <div className="space-y-4">
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
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer"
                onClick={() => onRowClick(row.original.task)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {data.length} task{data.length !== 1 ? "s" : ""}{countNote}
        </p>
        {table.getPageCount() > 1 && (
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
