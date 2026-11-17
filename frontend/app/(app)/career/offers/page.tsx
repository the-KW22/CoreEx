import { getApi } from "@/lib/api/server";

import { OffersView } from "./offers-view";

// Offers (docs/career/career-features-decisions.md): every Offer of the User's Applications, with its terms and checks.
export default async function OffersPage() {
  const api = await getApi();
  const offers = await api.GET("/api/offers").catch(() => null);
  // The Add Offer picker lists every Application, 100 a page.
  // shortcut: reads at most 10 pages (1,000 Applications), upgrade to a search box when a User has more.
  const applications: { id: string; title: string }[] = [];
  for (let page = 0; page < 10; page++) {
    const listed = await api.GET("/api/applications", { params: { query: { size: 100, page } } }).catch(() => null);
    if (!listed?.data) break;
    applications.push(...listed.data.items.map((a) => ({ id: a.id, title: a.title })));
    if (applications.length >= listed.data.total) break;
  }

  if (!offers?.data) {
    return <p role="alert">Cannot reach the CoreEx API. Is the backend running?</p>;
  }
  return (
    <div className="mx-auto grid max-w-4xl gap-10">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold">Offers</h1>
        <p className="text-sm text-muted-foreground">The terms of each Offer. Terms you leave empty stay Not set; CoreEx never converts currency.</p>
      </header>
      <OffersView
        items={offers.data.items}
        applications={applications}
      />
    </div>
  );
}
