import { KeyRoundIcon } from "lucide-react";
import Link from "next/link";

import { DocsHeading } from "@/components/docs/docs-heading";
import { Button } from "@/components/ui/button";

const PROMPTS = [
  "Find the Notes that mention my orphans by name, and link them.",
  "Search CoreEx for everything about the Lisbon trip and summarise it.",
  "Create a Note in my Research Folder with the open questions from this conversation, tagged follow-up.",
  "In my Note “Weekly plan”, move Friday’s meeting to 3 pm.",
  "Find Notes that have no Tag and suggest Tags for them. Apply them once I agree.",
  "Move every Note about the garden into a new Folder called Garden.",
  "What is in my Trash? Restore the Note about recipes.",
  "Read my Career Facts, then make a Resume for the Engineer role at Acme from only the ones I have confirmed.",
  "Show the Applications that need me now, and add a timeline note for today’s call with Acme.",
  "Write a Cover Letter for my Acme application, linked to my latest Resume, and fill in its greeting and body.",
];

const h1 = "text-3xl font-semibold tracking-tight md:text-4xl";

// The overview of the MCP server: what it is and what an Agent can do. The other MCP pages are in the sidebar.
export default function McpOverviewPage() {
  return (
    <>
      <div className="grid gap-4">
        <h1 className={h1}>MCP server</h1>
        <p className="text-muted-foreground">
          Let an AI tool such as Claude Code, Codex or Claude Desktop work with your knowledge base through CoreEx’s MCP
          server (Model Context Protocol, an open standard for connecting AI tools to apps).
        </p>
        <div>
          <Button asChild>
            <Link href="/settings/tokens">
              <KeyRoundIcon aria-hidden />
              Create an Access token
            </Link>
          </Button>
        </div>
      </div>

      <section aria-labelledby="what" className="grid gap-4">
        <DocsHeading level={2} id="what">
          What an Agent can do
        </DocsHeading>
        <p>
          An Agent acts as you, through an Access token. It can find and read your Notes and Assets, write and edit Notes,
          organise Folders and Tags, move things to the Trash and back, and work with your Applications, Resumes, Cover
          Letters and the Career Facts you have confirmed. It can never delete anything for good.
        </p>
        <DocsHeading level={3} id="things-you-can-ask">
          Things you can ask
        </DocsHeading>
        <ul className="grid gap-2">
          {PROMPTS.map((prompt) => (
            <li key={prompt} className="rounded-[10px] border border-border bg-surface px-3 py-2 text-sm">
              {prompt}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
