"use client";

// The last resort, when even the root layout fails: it brings its own <html> and <body>, so it uses plain styles
// that do not depend on the app's CSS.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, display: "grid", minHeight: "100dvh", placeItems: "center", padding: 16 }}>
        <main style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
          <p>Try again, or reload the page.</p>
          <button type="button" onClick={reset} style={{ font: "inherit", padding: "8px 16px" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
