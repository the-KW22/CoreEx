import { Suspense } from "react";

import { Shell } from "./shell";
import { TimezoneCookie } from "./timezone-cookie";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <TimezoneCookie />
      <Suspense fallback={<p className="p-8 text-sm text-muted-foreground">Loading…</p>}>
        <Shell>{children}</Shell>
      </Suspense>
    </>
  );
}
