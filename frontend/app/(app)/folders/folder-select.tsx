import type { Folder } from "@/lib/folders";
import { flatten } from "@/lib/folders";

// A menu of Folders, indented by depth. The first choice is the top level (or `emptyLabel`, such as "Any Folder"). `skip` leaves out a Folder and its
// subfolders (a Folder cannot be moved into itself).
export function FolderSelect({
  name,
  label,
  folders,
  selected,
  skip,
  emptyLabel = "Top level",
}: {
  name: string;
  label: string;
  folders: Folder[];
  selected: string | null;
  skip?: string;
  emptyLabel?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={selected ?? ""}>
        <option value="">{emptyLabel}</option>
        {flatten(folders, skip).map((folder) => (
          <option key={folder.id} value={folder.id}>
            {"  ".repeat(folder.depth)}
            {folder.name}
          </option>
        ))}
      </select>
    </label>
  );
}
