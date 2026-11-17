import { DocsFrame } from "@/components/docs/docs-frame";

// Every page under /docs: the sidebar, "On this page" and Copy page (docs/DESIGN.md section 6.11).
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsFrame>{children}</DocsFrame>;
}
