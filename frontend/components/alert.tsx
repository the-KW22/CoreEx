import { cn } from "@/lib/utils";

// A message in the page: an error or warning (`destructive`, the default) or a plain note (`neutral`). Use
// role="alert" for what just went wrong and role="status" for what is merely worth knowing.
export function Alert({
  role = "alert",
  tone = "destructive",
  className,
  children,
}: {
  role?: "alert" | "status";
  tone?: "destructive" | "neutral";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      role={role}
      className={cn(
        "rounded-lg border px-3 py-2 text-sm",
        tone === "destructive" ? "border-destructive/40" : "border-border",
        className,
      )}
    >
      {children}
    </p>
  );
}
