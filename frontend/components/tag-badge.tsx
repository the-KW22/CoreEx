import { tagColour, type TagColour } from "@/lib/tag-colour";
import { cn } from "@/lib/utils";

// A Tag pill: its picked colour, or one taken from its name when it has none.
export function TagBadge({ name, colour, className }: { name: string; colour?: TagColour | null; className?: string }) {
  return (
    <span
      data-colour={colour ?? tagColour(name)}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        "text-(--tag) bg-[color-mix(in_srgb,var(--tag)_var(--tag-tint),transparent)]",
        className,
      )}
    >
      {name}
    </span>
  );
}
