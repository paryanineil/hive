import { useState } from "react"
import { useFrappeGetCall, useFrappeCreateDoc, useFrappeUpdateDoc, useFrappeDeleteDoc } from "frappe-react-sdk"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, PencilEdit01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { getFrappeErrorMessage } from "@/lib/frappeError"

interface ChecklistTemplate {
  name: string
  template_name: string
  items: string[]
}

/**
 * Manage checklist templates (Settings → General). A template is a named list
 * of items; applying one from a task's checklist appends those items unticked.
 * Items are edited as one line per item — simplest thing that works well.
 */
export function ChecklistTemplatesSection() {
  const { data, isLoading, mutate } = useFrappeGetCall<{ message: ChecklistTemplate[] }>(
    "bwh_hive.bwh_hive.api.get_checklist_templates", undefined, "checklist-templates",
  )
  const templates = data?.message ?? []

  const { createDoc, loading: creating } = useFrappeCreateDoc()
  const { updateDoc, loading: updating } = useFrappeUpdateDoc()
  const { deleteDoc } = useFrappeDeleteDoc()

  // null = closed, "" = creating new, otherwise the template being edited
  const [editing, setEditing] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState("")
  const [itemsDraft, setItemsDraft] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<ChecklistTemplate | null>(null)

  const openEditor = (t?: ChecklistTemplate) => {
    setEditing(t ? t.name : "")
    setNameDraft(t?.template_name ?? "")
    setItemsDraft((t?.items ?? []).join("\n"))
  }

  const parseItems = () =>
    itemsDraft.split("\n").map((l) => l.trim()).filter(Boolean)
      .map((content) => ({ content, completed: 0 }))

  const save = async () => {
    const template_name = nameDraft.trim()
    const items = parseItems()
    if (!template_name) return toast.error("Give the template a name")
    if (!items.length) return toast.error("Add at least one item (one per line)")
    try {
      if (editing === "") {
        await createDoc("Hive Checklist Template", { template_name, items })
        toast.success(`Template "${template_name}" created`)
      } else {
        await updateDoc("Hive Checklist Template", editing!, { template_name, items })
        toast.success(`Template "${template_name}" updated`)
      }
      setEditing(null)
      mutate()
    } catch (err) {
      toast.error(getFrappeErrorMessage(err, "Failed to save template"))
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const t = deleteTarget
    setDeleteTarget(null)
    try {
      await deleteDoc("Hive Checklist Template", t.name)
      if (editing === t.name) setEditing(null)
      mutate()
      toast.success(`Template "${t.template_name}" deleted`)
    } catch (err) {
      toast.error(getFrappeErrorMessage(err, "Failed to delete template"))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Checklist Templates</h3>
          <p className="text-xs text-muted-foreground">
            Reusable checklists — apply one from a task's checklist to add its items.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => openEditor()}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="mr-1.5 size-4" />
          New
        </Button>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="px-4 py-3"><Skeleton className="h-4 w-40" /></div>
          ))}
        </div>
      ) : templates.length > 0 ? (
        <div className="divide-y divide-border rounded-lg border border-border">
          {templates.map((t) => (
            <div key={t.name} className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm">{t.template_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.items.length} item{t.items.length !== 1 ? "s" : ""} · {t.items.slice(0, 3).join(", ")}{t.items.length > 3 ? "…" : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                <Button variant="ghost" size="sm" onClick={() => openEditor(t)} aria-label={`Edit ${t.template_name}`}>
                  <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(t)} aria-label={`Delete ${t.template_name}`}>
                  <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No templates yet. Create one above.</p>
      )}

      {editing !== null && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="grid gap-2">
            <Label htmlFor="tpl-name">Template name</Label>
            <Input
              id="tpl-name"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="e.g. Release checklist"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tpl-items">Items — one per line</Label>
            <Textarea
              id="tpl-items"
              value={itemsDraft}
              onChange={(e) => setItemsDraft(e.target.value)}
              placeholder={"Write tests\nUpdate docs\nDeploy"}
              rows={6}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={creating || updating}>
              {editing === "" ? "Create template" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.template_name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Tasks that already used this template keep their items — only the template is removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
