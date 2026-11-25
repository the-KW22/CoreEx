import type { Metadata } from "next";

import { MarketingFooter } from "@/components/marketing/footer";
import { Hero } from "@/components/marketing/hero";
import { MarketingNav } from "@/components/marketing/nav";

const description = "Write Notes, keep Assets, and let Links turn them into a Graph. Ask your own knowledge a question, or let your AI agent use it too.";

export const metadata: Metadata = {
  title: "CoreEx: everything you know, connected",
  description,
  openGraph: { title: "CoreEx: everything you know, connected", description, type: "website", siteName: "CoreEx" },
};

// The public page for signed-out visitors (docs/DESIGN.md "Marketing page"). No rail, no API calls, rendered at build time.
export default function WelcomePage() {
  return (
    <div className="marketing">
      <MarketingNav />
      <main>
        <Hero />
      </main>
      <MarketingFooter />
    </div>
  );
}
