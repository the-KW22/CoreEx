import type { Folder } from "@/lib/folders";
import { flatten } from "@/lib/folders";

// A menu of Folders, indented by depth. The first choice is the top level. `skip` leaves out a Folder and its
// subfolders (a Folder cannot be moved into itself).
export function FolderSelect({
  name,
  label,
  folders,
  selected,
  skip,
}: {
  name: string;
  label: string;
  folders: Folder[];
  selected: string | null;
  skip?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={selected ?? ""}>
        <option value="">Top level</option>
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
