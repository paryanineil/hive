import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { useSearchParams } from "react-router"
import {
  useFrappeGetDocList,
  useFrappeGetDoc,
  useFrappeCreateDoc,
  useFrappeUpdateDoc,
} from "frappe-react-sdk"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Add01Icon,
  Folder01Icon,
  FolderOpenIcon,
  File01Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  Delete02Icon,
  Search01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { LazyTiptapEditor } from "@/components/LazyTiptapEditor"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import type { HiveNote } from "@/types"

interface TreeNode extends HiveNote {
  children: TreeNode[]
  depth: number
}

const AUTOSAVE_MS = 1200

export function NotesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get("note") ?? ""
  const isMobile = useIsMobile()

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<HiveNote | null>(null)
  const [treeOpen, setTreeOpen] = useState(false)
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")

  const { createDoc } = useFrappeCreateDoc()
  const { updateDoc } = useFrappeUpdateDoc()

  const { data: notes, isLoading, mutate } = useFrappeGetDocList<HiveNote>("Hive Note", {
    fields: ["name", "title", "is_folder", "parent_note", "icon", "modified"],
    filters: [["is_archived", "=", 0]],
    orderBy: { field: "title", order: "asc" },
    limit: 1000,
  })

  const { data: activeNote, mutate: mutateActive } = useFrappeGetDoc<HiveNote>(
    "Hive Note", selected || "", selected ? undefined : null,
  )

  const selectNote = useCallback((name: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (name) next.set("note", name)
      else next.delete("note")
      return next
    }, { replace: true })
    if (isMobile) setTreeOpen(false)
  }, [setSearchParams, isMobile])

  // Build the nested tree from the flat list.
  const tree = useMemo(() => {
    const all = notes ?? []
    const byParent = new Map<string, HiveNote[]>()
    for (const n of all) {
      const key = n.parent_note ?? "__root__"
      byParent.set(key, [...(byParent.get(key) ?? []), n])
    }
    // Folders first, then notes, each alphabetical.
    const sortNodes = (list: HiveNote[]) =>
      [...list].sort((a, b) => (b.is_folder - a.is_folder) || a.title.localeCompare(b.title))

    const build = (parentKey: string, depth: number): TreeNode[] =>
      sortNodes(byParent.get(parentKey) ?? []).map((n) => ({
        ...n, depth, children: build(n.name, depth + 1),
      }))

    return build("__root__", 0)
  }, [notes])

  // Searching flattens the tree to matches so deep hits aren't hidden.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    return (notes ?? []).filter((n) => n.title.toLowerCase().includes(q))
  }, [search, notes])

  // Reveal the selected note by expanding its ancestors.
  useEffect(() => {
    if (!selected || !notes) return
    const byName = new Map(notes.map((n) => [n.name, n]))
    const toOpen: string[] = []
    let cur = byName.get(selected)?.parent_note ?? null
    while (cur) {
      toOpen.push(cur)
      cur = byName.get(cur)?.parent_note ?? null
    }
    if (toOpen.length) setExpanded((prev) => new Set([...prev, ...toOpen]))
  }, [selected, notes])

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  const create = async (isFolder: boolean, parent: string | null) => {
    try {
      const doc = await createDoc("Hive Note", {
        title: isFolder ? "New folder" : "Untitled",
        is_folder: isFolder ? 1 : 0,
        parent_note: parent,
      })
      await mutate()
      if (parent) setExpanded((prev) => new Set([...prev, parent]))
      if (!isFolder) selectNote(doc.name)
      setRenaming(doc.name)
      setRenameDraft(isFolder ? "New folder" : "Untitled")
    } catch {
      toast.error(`Failed to create ${isFolder ? "folder" : "note"}`)
    }
  }

  const commitRename = async (name: string) => {
    const title = renameDraft.trim()
    setRenaming(null)
    if (!title) return
    try {
      await updateDoc("Hive Note", name, { title })
      await mutate()
      if (name === selected) mutateActive()
    } catch {
      toast.error("Failed to rename")
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const { name, title, is_folder } = deleteTarget
    setDeleteTarget(null)
    try {
      // Soft delete, consistent with the rest of Hive — recoverable from the Bin.
      await updateDoc("Hive Note", name, { is_archived: 1 })
      await mutate()
      if (name === selected) selectNote("")
      toast(`${is_folder ? "Folder" : "Note"} "${title}" moved to Bin`, {
        action: {
          label: "Undo",
          onClick: async () => {
            await updateDoc("Hive Note", name, { is_archived: 0 })
            mutate()
          },
        },
        duration: 6000,
      })
    } catch {
      toast.error("Failed to delete")
    }
  }

  // ---- editor autosave -------------------------------------------------
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const handleContentChange = useCallback((html: string) => {
    if (!selected) return
    setSaveState("saving")
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await updateDoc("Hive Note", selected, { content: html })
        setSaveState("saved")
        setTimeout(() => setSaveState("idle"), 1500)
      } catch {
        setSaveState("idle")
        toast.error("Failed to save note")
      }
    }, AUTOSAVE_MS)
  }, [selected, updateDoc])

  // Flush any pending save when switching away from a note.
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [selected])

  // ---- tree rendering --------------------------------------------------
  const renderRow = (node: TreeNode) => {
    const isOpen = expanded.has(node.name)
    const isSel = node.name === selected
    const hasKids = node.children.length > 0
    return (
      <div key={node.name}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md pr-1 text-sm hover:bg-accent",
            isSel && "bg-accent font-medium",
          )}
          style={{ paddingLeft: node.depth * 12 }}
        >
          <button
            type="button"
            className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
            onClick={() => (hasKids || node.is_folder ? toggle(node.name) : selectNote(node.name))}
            aria-label={isOpen ? "Collapse" : "Expand"}
          >
            {(hasKids || node.is_folder) && (
              <HugeiconsIcon icon={isOpen ? ArrowDown01Icon : ArrowRight01Icon} strokeWidth={2} className="size-3.5" />
            )}
          </button>
          <HugeiconsIcon
            icon={node.is_folder ? (isOpen ? FolderOpenIcon : Folder01Icon) : File01Icon}
            strokeWidth={2}
            className="size-4 shrink-0 text-muted-foreground"
          />
          {renaming === node.name ? (
            <Input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={() => commitRename(node.name)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(node.name)
                if (e.key === "Escape") setRenaming(null)
              }}
              className="h-6 flex-1 px-1 py-0 text-sm"
            />
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 truncate py-1.5 text-left"
              onClick={() => (node.is_folder ? toggle(node.name) : selectNote(node.name))}
              onDoubleClick={() => { setRenaming(node.name); setRenameDraft(node.title) }}
            >
              {node.icon ? `${node.icon} ` : ""}{node.title}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost" size="icon"
                  className="size-6 shrink-0 opacity-0 group-hover:opacity-100 data-[popup-open]:opacity-100"
                  aria-label="Note actions"
                />
              }
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => create(false, node.name)}>
                <HugeiconsIcon icon={File01Icon} strokeWidth={2} /> New sub-note
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => create(true, node.name)}>
                <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} /> New folder inside
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setRenaming(node.name); setRenameDraft(node.title) }}>
                <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(node)}>
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {isOpen && node.children.map(renderRow)}
      </div>
    )
  }

  const treePanel = (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            className="h-8 pl-7 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label="Clear search"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
            </button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="icon" className="size-8 shrink-0" aria-label="New" />}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => create(false, null)}>
              <HugeiconsIcon icon={File01Icon} strokeWidth={2} /> New note
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => create(true, null)}>
              <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} /> New folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : searchResults ? (
          searchResults.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No matches.</p>
          ) : (
            searchResults.map((n) => (
              <button
                key={n.name}
                type="button"
                onClick={() => selectNote(n.name)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  n.name === selected && "bg-accent font-medium",
                )}
              >
                <HugeiconsIcon
                  icon={n.is_folder ? Folder01Icon : File01Icon}
                  strokeWidth={2}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="truncate">{n.title}</span>
              </button>
            ))
          )
        ) : tree.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">
            No notes yet. Use <span className="font-medium">+</span> to create your first note or folder.
          </div>
        ) : (
          tree.map(renderRow)
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notes</h1>
          <p className="mt-1 hidden text-muted-foreground sm:block">
            Organise notes in nested folders.
          </p>
        </div>
        {isMobile && (
          <Button variant="outline" size="sm" onClick={() => setTreeOpen(true)}>
            <HugeiconsIcon icon={Folder01Icon} strokeWidth={2} className="size-4" />
            Browse
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Tree: inline on desktop, drawer on mobile */}
        {!isMobile && (
          <aside className="w-64 shrink-0 rounded-md border p-2">{treePanel}</aside>
        )}
        {isMobile && (
          <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
            <SheetContent side="left" className="w-[85vw] p-3">
              <SheetTitle className="mb-2 text-base">Notes</SheetTitle>
              {treePanel}
            </SheetContent>
          </Sheet>
        )}

        {/* Editor */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-md border">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              Select a note to start writing, or create a new one.
            </div>
          ) : !activeNote ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-7 w-64" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
                <input
                  value={activeNote.title}
                  onChange={(e) => mutateActive({ ...activeNote, title: e.target.value }, false)}
                  onBlur={async (e) => {
                    const title = e.target.value.trim()
                    if (!title || title === notes?.find((n) => n.name === selected)?.title) return
                    await updateDoc("Hive Note", selected, { title })
                    mutate()
                  }}
                  className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
                  placeholder="Untitled"
                />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {saveState === "saving" ? "Saving…"
                    : saveState === "saved" ? "Saved"
                    : activeNote.modified ? `Edited ${formatDistanceToNow(new Date(activeNote.modified), { addSuffix: true })}` : ""}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <LazyTiptapEditor
                  key={selected}
                  content={activeNote.content || ""}
                  onChange={handleContentChange}
                  placeholder="Start writing..."
                />
              </div>
            </>
          )}
        </section>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{deleteTarget?.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.is_folder
                ? "The folder moves to the Bin. Anything inside it moves up a level rather than being deleted."
                : "The note moves to the Bin. You can restore it from there."}
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
