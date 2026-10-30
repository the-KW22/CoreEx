import { Suspense } from "react";

import { Shell } from "./shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Loading…</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
