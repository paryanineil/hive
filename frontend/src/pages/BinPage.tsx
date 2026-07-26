import { useState } from "react"
import { Link } from "react-router"
import { useFrappeGetDocList, useFrappeUpdateDoc } from "frappe-react-sdk"
import { toast } from "sonner"
import { format } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import type { HiveProject, HiveTask } from "@/types"

/**
 * Bin — deleted (archived) projects and tasks, with restore.
 *
 * "Delete" in Hive is a soft delete (`is_archived = 1`), so nothing is ever
 * lost; this page surfaces those records and puts them back.
 */
export function BinPage() {
  const [restoring, setRestoring] = useState<string | null>(null)
  const { updateDoc } = useFrappeUpdateDoc()

  const {
    data: projects,
    isLoading: projectsLoading,
    mutate: mutateProjects,
  } = useFrappeGetDocList<HiveProject>("Hive Project", {
    fields: ["name", "title", "status", "project_type", "modified"],
    filters: [["is_archived", "=", 1]],
    orderBy: { field: "modified", order: "desc" },
    limit: 200,
  })

  const {
    data: tasks,
    isLoading: tasksLoading,
    mutate: mutateTasks,
  } = useFrappeGetDocList<HiveTask>("Hive Task", {
    fields: ["name", "title", "status", "priority", "project", "modified"],
    filters: [["is_archived", "=", 1]],
    orderBy: { field: "modified", order: "desc" },
    limit: 200,
  })

  const { data: allProjects } = useFrappeGetDocList<HiveProject>("Hive Project", {
    fields: ["name", "title"],
    limit: 200,
  })
  const projectTitle = (name: string) =>
    allProjects?.find((p) => p.name === name)?.title ?? name

  const restore = async (doctype: "Hive Project" | "Hive Task", name: string, label: string) => {
    setRestoring(name)
    try {
      await updateDoc(doctype, name, { is_archived: 0 })
      if (doctype === "Hive Project") mutateProjects()
      else mutateTasks()
      toast.success(`Restored “${label}”`)
    } catch {
      toast.error("Failed to restore")
    } finally {
      setRestoring(null)
    }
  }

  const loadingRows = (cols: number) => (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-32" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )

  const emptyState = (what: string) => (
    <Empty className="border rounded-2xl p-12">
      <EmptyHeader>
        <EmptyMedia>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.5} className="size-10 text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle>Bin is empty</EmptyTitle>
        <EmptyDescription>Deleted {what} will appear here and can be restored.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bin</h1>
        <p className="mt-1 text-muted-foreground">
          Deleted projects and tasks. Nothing is permanently removed — restore anything from here.
        </p>
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">
            Tasks {tasks?.length ? <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{tasks.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="projects">
            Projects {projects?.length ? <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{projects.length}</Badge> : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <div className="pt-2">
            {tasksLoading ? (
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>{["Task", "Project", "Status", "Deleted", ""].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>{loadingRows(5)}</TableBody>
                </Table>
              </div>
            ) : tasks && tasks.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Deleted</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((t) => (
                      <TableRow key={t.name}>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell className="text-muted-foreground">{projectTitle(t.project)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5">{t.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {t.modified ? format(new Date(t.modified), "MMM d, yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={restoring === t.name}
                            onClick={() => restore("Hive Task", t.name, t.title)}
                          >
                            <HugeiconsIcon icon={ArrowTurnBackwardIcon} strokeWidth={2} className="size-3.5 mr-1.5" />
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              emptyState("tasks")
            )}
          </div>
        </TabsContent>

        <TabsContent value="projects">
          <div className="pt-2">
            {projectsLoading ? (
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>{["Project", "Type", "Status", "Deleted", ""].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>{loadingRows(5)}</TableBody>
                </Table>
              </div>
            ) : projects && projects.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Deleted</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((p) => (
                      <TableRow key={p.name}>
                        <TableCell className="font-medium">
                          <Link to={`/projects/${p.name}`} className="hover:underline">{p.title}</Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.project_type || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] h-5 px-1.5">{p.status}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.modified ? format(new Date(p.modified), "MMM d, yyyy") : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={restoring === p.name}
                            onClick={() => restore("Hive Project", p.name, p.title)}
                          >
                            <HugeiconsIcon icon={ArrowTurnBackwardIcon} strokeWidth={2} className="size-3.5 mr-1.5" />
                            Restore
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              emptyState("projects")
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
