import { Suspense } from "react";

import { HealthStatus } from "./health-status";

export default function Home() {
  return (
    <main>
      <h1>CoreEx</h1>
      <Suspense fallback={<p>Checking the API…</p>}>
        <HealthStatus />
      </Suspense>
    </main>
  );
}
