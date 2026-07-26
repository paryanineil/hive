import { useState } from "react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { HugeiconsIcon } from "@hugeicons/react"
import { UnfoldMoreIcon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"

export interface MultiSelectOption {
  value: string
  label: string
}

interface MultiSelectProps {
  /** Prefix label shown in the trigger, e.g. "Project:" */
  label: string
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  /** Shown when nothing is selected. Default "All". */
  placeholder?: string
  searchPlaceholder?: string
  /** Show the search box (default true). */
  searchable?: boolean
  triggerClassName?: string
}

/**
 * A searchable multi-select dropdown (Popover + Command) styled to match the
 * task filters. Nothing selected = "All" (no filter). Multiple selections show
 * "N selected". Stays open across selections so several can be picked at once.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "All",
  searchPlaceholder = "Search...",
  searchable = true,
  triggerClassName,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 gap-1.5 rounded-4xl border-input bg-input/30 px-3 font-normal",
              triggerClassName,
            )}
          />
        }
      >
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("truncate max-w-[150px]", selected.length === 0 && "text-muted-foreground")}>
          {summary}
        </span>
        <HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          {searchable && <CommandInput placeholder={searchPlaceholder} />}
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            {selected.length > 0 && (
              <CommandGroup>
                <CommandItem value="__clear__" onSelect={() => onChange([])} className="text-muted-foreground">
                  Clear selection
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)} className="gap-2">
                  <Checkbox checked={selected.includes(o.value)} className="pointer-events-none" />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
