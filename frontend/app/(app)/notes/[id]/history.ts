// Who wrote a version's text: the Access token's name, or the User.
export const writtenBy = (editedBy: string | null) => editedBy ?? "You";

// Why a restore must wait, or null when it may go ahead. The restore keeps the stored text, so anything typed or
// still being saved has to reach the server first.
export function restoreBlocker(editor: { conflict: boolean; saving: boolean; unsaved: boolean }) {
  if (editor.conflict) return "Settle the conflict first: keep your version or load the other one.";
  if (editor.saving || editor.unsaved) return "Your latest changes are not saved yet. Try again in a moment.";
  return null;
}
