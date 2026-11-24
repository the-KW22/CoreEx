const h1 = "text-3xl font-semibold tracking-tight md:text-4xl";

const SHORTCUTS = [
  ["Ctrl K", "Quick find: search, open a recent Item or make a Note from anywhere"],
  ["Ctrl J", "Open or close the Chat panel (not on the Chat page itself)"],
  ["Ctrl \\", "Collapse or expand the sidebar"],
  ["Ctrl B", "Bold, in the Note editor"],
  ["Ctrl I", "Italic, in the Note editor"],
  ["Esc", "Close the panel, menu or dialog you are in"],
];

// Every keyboard shortcut in one place. On a Mac, Cmd works wherever Ctrl does.
export default function ShortcutsPage() {
  return (
    <>
      <div className="grid gap-3">
        <h1 className={h1}>Keyboard shortcuts</h1>
        <p className="text-muted-foreground">On a Mac, use Cmd where this page says Ctrl.</p>
      </div>
      <dl className="grid divide-y divide-border-subtle rounded-[14px] border border-border bg-surface text-sm">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="grid gap-1 p-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
            <dt className="font-mono font-medium">{keys}</dt>
            <dd className="text-muted-foreground">{what}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
