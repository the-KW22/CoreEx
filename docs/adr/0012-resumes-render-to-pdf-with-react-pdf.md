# Resumes and Cover Letters render to PDF with react-pdf

Resume templates are React components drawn with **react-pdf** (`@react-pdf/renderer`). In the editor they run in a **Web Worker in the browser**, so the live preview is the very file the User downloads and typing stays smooth. A Cover Letter is drawn by the same templates as a one-section resume, as Reactive Resume does, so it needs no templates of its own and "match the Resume's design" is just sharing the design.

The Export zip includes a PDF of each Resume and Cover Letter, but Export is built by the Java backend, which cannot run React. A **Next.js route handler** on the frontend server (Node) runs the same templates and returns the PDF; the backend calls it while building the zip. No new service is deployed.

## Considered Options

- **HTML templates with print CSS**: the easiest templates, but print output varies by browser, and a server PDF would need a headless Chrome on Render's small instances.
- **Rendering in Spring Boot** (for example OpenHTMLtoPDF): consistent output, but the preview would need a round trip per keystroke.
- **The browser saves the last PDF it made** for Export: no server work, but the file can be stale or missing.
- **A separate Node render service**: most flexible, one more thing to deploy. Not needed yet.

## Consequences

- The frontend server stops being only a UI host: it serves one internal route that the backend calls. How the backend proves itself to that route (a shared secret held only in Render, or a short-lived signed request) is decided in its ticket, and the route must refuse anything else.
- Templates, the page map (which box on the page belongs to which section or entry) and fit-to-page all live in the frontend, in one place shared by the worker and the route.
- Fonts are loaded and subset by react-pdf; English only for now, with a locale field stored so other scripts can be added.
- Downloads are PDF, Print, DOCX, Markdown and JSON; DOCX is made separately and is close to, not identical with, the PDF.
