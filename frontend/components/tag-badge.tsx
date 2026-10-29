import { tagColour, type TagColour } from "@/lib/tag-colour";
import { cn } from "@/lib/utils";

// A Tag pill. Until the API stores a picked colour (#59), the colour comes from the Tag name.
export function TagBadge({ name, colour, className }: { name: string; colour?: TagColour; className?: string }) {
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
