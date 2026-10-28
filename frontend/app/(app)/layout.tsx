import { Suspense } from "react";

import { Shell } from "./shell";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<p className="card">Loading…</p>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
