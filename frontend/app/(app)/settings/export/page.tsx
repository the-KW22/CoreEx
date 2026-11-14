import { DownloadIcon } from "lucide-react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";

const errors: Record<string, string> = {
  wait: "You can export once a minute. Try again shortly.",
  failed: "The export could not be made. Try again.",
};

// Export (docs/DESIGN.md section 6.13): everything the User keeps, as one zip they can open anywhere.
export default async function ExportPage({ searchParams }: PageProps<"/settings/export">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? errors[error] : undefined;

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Export</h1>
        <p className="text-sm text-muted-foreground">
          Take everything you keep in CoreEx with you, as one zip.
        </p>
      </header>

      {message && <Alert>{message}</Alert>}

      <section aria-labelledby="export-contents" className="grid gap-2">
        <h2 id="export-contents" className="text-sm font-semibold text-muted-foreground">
          What is in the zip
        </h2>
        <ul className="grid list-disc gap-1 pl-5 text-sm">
          <li>Your Notes as Markdown files, exactly as written, with their Links as written.</li>
          <li>Your Assets as the files you uploaded.</li>
          <li>Folders as folders, so everything sits where it does in CoreEx.</li>
          <li>
            A <code className="font-mono">manifest.json</code> that lists every Item with its Folder, Tags and
            times, and anything that could not be included.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          The Trash and Chats are not included. You can export once a minute.
        </p>
      </section>

      <div>
        {/* A plain link: the answer is a file, which the browser saves, and a refusal comes back to this page. */}
        <Button asChild>
          <a href="/settings/export/download">
            <DownloadIcon aria-hidden />
            Download everything
          </a>
        </Button>
      </div>
    </div>
  );
}
