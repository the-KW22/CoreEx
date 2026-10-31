"use client";

import { useId, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Folder } from "@/lib/folders";
import { flatten } from "@/lib/folders";
import { cn } from "@/lib/utils";

// A Select item cannot have an empty value, so the top level is this one; a hidden input still sends "" for it.
const TOP = "__top__";

// A menu of Folders, indented by depth. The first choice is the top level (or `emptyLabel`, such as "Any Folder"). `skip` leaves out a Folder and its
// subfolders (a Folder cannot be moved into itself). In a form it submits the Folder id, or "" for the first choice.
// `onChange` runs when another Folder is chosen (null for the first choice).
export function FolderSelect({
  name,
  label,
  folders,
  selected,
  skip,
  emptyLabel = "Top level",
  onChange,
  disabled,
  className,
}: {
  name: string;
  label: string;
  folders: Folder[];
  selected: string | null;
  skip?: string;
  emptyLabel?: string;
  onChange?: (folderId: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(selected ?? TOP);
  const labelId = useId();
  return (
    <div className={cn("grid gap-1.5 text-sm font-medium", className)}>
      <span id={labelId}>{label}</span>
      <input type="hidden" name={name} value={value === TOP ? "" : value} />
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          setValue(next);
          onChange?.(next === TOP ? null : next);
        }}
      >
        <SelectTrigger aria-labelledby={labelId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TOP}>{emptyLabel}</SelectItem>
          {flatten(folders, skip).map((folder) => (
            <SelectItem key={folder.id} value={folder.id} style={{ paddingLeft: `${0.5 + folder.depth}rem` }}>
              {folder.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
