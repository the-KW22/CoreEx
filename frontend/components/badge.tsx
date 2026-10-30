import type { TagColour } from "@/lib/tag-colour";
import { cn } from "@/lib/utils";

// A small status pill in one of the Tag colours (docs/DESIGN.md 4.4): gray for neutral, green for good, orange for
// "look at this", and so on. The shades live in globals.css, so both themes stay readable.
export function Badge({
  colour = "gray",
  className,
  children,
}: {
  colour?: TagColour;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-colour={colour}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        "text-(--tag) bg-[color-mix(in_srgb,var(--tag)_var(--tag-tint),transparent)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
