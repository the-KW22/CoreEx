"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// "Move to the Trash?" for one Item or several (docs/DESIGN.md section 7). `names` is the titles to confirm; null keeps it
// closed. Cancel and Escape do nothing; focus goes back to what opened it.
export function ConfirmTrash({
  names,
  onConfirm,
  onCancel,
}: {
  names: string[] | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const many = (names?.length ?? 0) > 1;
  return (
    <AlertDialog open={names !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="border-border bg-popover sm:max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{many ? `Move ${names?.length} Items to the Trash?` : `Move "${names?.[0]}" to the Trash?`}</AlertDialogTitle>
          <AlertDialogDescription>You can restore {many ? "them" : "it"} from the Trash.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Move to Trash
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
