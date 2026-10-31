// The number of Items directly in a Folder; the words are for screen readers.
export function ItemCount({ count }: { count: number }) {
  return (
    <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
      {count}
      <span className="sr-only"> {count === 1 ? "Item" : "Items"}</span>
    </span>
  );
}
