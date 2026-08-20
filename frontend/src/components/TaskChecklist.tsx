import { useState, useMemo, useCallback } from "react"
import { useFrappeUpdateDoc, useFrappeGetCall } from "frappe-react-sdk"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Cancel01Icon, TaskDaily01Icon } from "@hugeicons/core-free-icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { HiveTaskChecklistItem } from "@/types"

interface TaskChecklistProps {
  taskName: string
  items: HiveTaskChecklistItem[]
  readOnly?: boolean
  /** Called after a successful save so the parent can refresh the task. */
  onChanged?: () => void
}

/**
 * Checklist (sub-items) for a task. Saves immediately on every change rather
 * than riding the sheet's autosave, so ticking a box can't be lost by an
 * unsaved-form race — the same self-contained approach TaskAttachments uses.
 */
export function TaskChecklist({ taskName, items, readOnly = false, onChanged }: TaskChecklistProps) {
  // Local copy for instant feedback; the server response is authoritative.
  const [rows, setRows] = useState<HiveTaskChecklistItem[]>(items)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const { updateDoc } = useFrappeUpdateDoc()

  // Re-sync when a different task is opened.
  const [syncedFor, setSyncedFor] = useState(taskName)
  if (syncedFor !== taskName) {
    setSyncedFor(taskName)
    setRows(items)
    setDraft("")
  }

  const done = useMemo(() => rows.filter((r) => r.completed).length, [rows])
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0

  const persist = useCallback(async (next: HiveTaskChecklistItem[], previous: HiveTaskChecklistItem[]) => {
    setRows(next)
    setSaving(true)
    try {
      await updateDoc("Hive Task", taskName, {
        checklist: next.map((r) => ({ content: r.content, completed: r.completed })),
      })
      onChanged?.()
    } catch {
      setRows(previous)   // roll back the optimistic update
      toast.error("Failed to save checklist")
    } finally {
      setSaving(false)
    }
  }, [taskName, updateDoc, onChanged])

  // Checklist templates (managed in Settings -> General).
  const { data: templatesData } = useFrappeGetCall<{
    message: { name: string; template_name: string; items: string[] }[]
  }>("bwh_hive.bwh_hive.api.get_checklist_templates", undefined, readOnly ? null : "checklist-templates")
  const templates = templatesData?.message ?? []

  const applyTemplate = (template: { template_name: string; items: string[] }) => {
    if (!template.items.length) return
    // Append rather than replace, skipping items the task already has.
    const existing = new Set(rows.map((r) => r.content.trim().toLowerCase()))
    const fresh = template.items
      .filter((c) => !existing.has(c.trim().toLowerCase()))
      .map((content) => ({ content, completed: 0 as const }))
    if (!fresh.length) {
      toast.info("All items from that template are already on this task")
      return
    }
    persist([...rows, ...fresh], rows)
    toast.success(`Added ${fresh.length} item${fresh.length !== 1 ? "s" : ""} from "${template.template_name}"`)
  }

  const addItem = () => {
    const text = draft.trim()
    if (!text) return
    setDraft("")
    persist([...rows, { content: text, completed: 0 }], rows)
  }

  const toggle = (index: number) => {
    persist(
      rows.map((r, i) => (i === index ? { ...r, completed: r.completed ? 0 : 1 } : r)),
      rows,
    )
  }

  const remove = (index: number) => {
    persist(rows.filter((_, i) => i !== index), rows)
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Checklist</span>
        <span className="flex items-center gap-2">
          {!readOnly && templates.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs text-muted-foreground" />}
              >
                <HugeiconsIcon icon={TaskDaily01Icon} strokeWidth={2} className="size-3.5" />
                Template
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {templates.map((t) => (
                  <DropdownMenuItem key={t.name} onClick={() => applyTemplate(t)}>
                    <span className="flex-1">{t.template_name}</span>
                    <span className="text-xs text-muted-foreground">{t.items.length}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {rows.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {done}/{rows.length}
            </span>
          )}
        </span>
      </div>

      {rows.length > 0 && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {rows.length > 0 && (
        <ul className="grid gap-0.5">
          {rows.map((item, i) => (
            <li key={item.name ?? `new-${i}`} className="group flex items-center gap-2 rounded px-1 py-1 hover:bg-accent/50">
              <Checkbox
                checked={!!item.completed}
                disabled={readOnly || saving}
                onCheckedChange={() => toggle(i)}
                aria-label={item.content}
              />
              <span className={cn("min-w-0 flex-1 text-sm break-words", item.completed && "text-muted-foreground line-through")}>
                {item.content}
              </span>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  disabled={saving}
                  onClick={() => remove(i)}
                  aria-label={`Remove ${item.content}`}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addItem()
              }
            }}
            placeholder="Add an item..."
            className="h-8 text-sm"
            disabled={saving}
          />
          <Button size="sm" variant="outline" onClick={addItem} disabled={!draft.trim() || saving}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3.5" />
          </Button>
        </div>
      )}

      {readOnly && rows.length === 0 && (
        <p className="py-1 text-sm text-muted-foreground">No checklist items</p>
      )}
    </div>
  )
}
