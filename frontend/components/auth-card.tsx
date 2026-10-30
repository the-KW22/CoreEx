import { cn } from "@/lib/utils";

// The frame for sign-in and the system pages (docs/DESIGN.md section 6.1): a centred card with the logo mark, a
// heading and the body. It is the page's <main>, and it fills the width on a phone with a 16px gutter.
export function AuthCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <div className={cn("grid w-full max-w-sm gap-5 rounded-[18px] border border-border bg-surface p-6 sm:p-8", className)}>
        <span aria-hidden className="grid size-10 place-items-center rounded-[12px] bg-primary text-lg font-bold text-primary-foreground">
          C
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}

// A message inside the card: an error (`alert`), or a plain note (`status`).
export function AuthMessage({ kind, children }: { kind: "alert" | "status"; children: React.ReactNode }) {
  return (
    <p
      role={kind}
      className={cn("rounded-lg border px-3 py-2 text-sm", kind === "alert" ? "border-destructive/40" : "border-border")}
    >
      {children}
    </p>
  );
}

export const authField = "grid gap-1.5 text-sm font-medium";
export const authInput = "h-10 rounded-lg border border-border bg-background px-3 font-normal";
