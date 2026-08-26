import { useState, useMemo, useCallback } from "react"
import { useFrappeUpdateDoc, useFrappeGetCall } from "frappe-react-sdk"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Cancel01Icon, TaskDaily01Icon } from "@hugeicons/core-free-icons"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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

  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const togglePicked = (name: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  /** Append the items of every selected template, deduped against the task and across templates. */
  const applyPicked = () => {
    const chosen = templates.filter((t) => picked.has(t.name))
    if (!chosen.length) return
    const seen = new Set(rows.map((r) => r.content.trim().toLowerCase()))
    const fresh: HiveTaskChecklistItem[] = []
    for (const t of chosen) {
      for (const content of t.items) {
        const key = content.trim().toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        fresh.push({ content, completed: 0 })
      }
    }
    setTemplatesOpen(false)
    setPicked(new Set())
    if (!fresh.length) {
      toast.info("All items from the selected templates are already on this task")
      return
    }
    persist([...rows, ...fresh], rows)
    const label = chosen.length === 1 ? `"${chosen[0].template_name}"` : `${chosen.length} templates`
    toast.success(`Added ${fresh.length} item${fresh.length !== 1 ? "s" : ""} from ${label}`)
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
            <Popover open={templatesOpen} onOpenChange={(o) => { setTemplatesOpen(o); if (!o) setPicked(new Set()) }}>
              <PopoverTrigger
                render={<Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs text-muted-foreground" />}
              >
                <HugeiconsIcon icon={TaskDaily01Icon} strokeWidth={2} className="size-3.5" />
                Templates
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-0">
                <p className="border-b px-3 py-2 text-xs text-muted-foreground">
                  Pick one or more templates to add their items
                </p>
                <div className="max-h-56 overflow-y-auto p-1">
                  {templates.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => togglePicked(t.name)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <Checkbox checked={picked.has(t.name)} className="pointer-events-none" />
                      <span className="min-w-0 flex-1 truncate">{t.template_name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{t.items.length}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={picked.size === 0}
                    onClick={() => setPicked(new Set())}
                  >
                    Clear
                  </Button>
                  <Button size="sm" className="h-7 text-xs" disabled={picked.size === 0} onClick={applyPicked}>
                    Apply{picked.size > 0 ? ` (${picked.size})` : ""}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
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
