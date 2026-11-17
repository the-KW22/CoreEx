"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";

import { compareOffers, type CompareResult } from "./actions";
import { OfferForm } from "./offer-form";
import { OfferRow } from "./offer-row";
import { ChecksList, termRows } from "./terms";

type OfferItem = components["schemas"]["OfferItem"];
type Comparison = components["schemas"]["Comparison"];
type Application = { id: string; title: string };
const field = "h-9 rounded-lg border border-border bg-surface px-3";

// The Offers list (#285), with Add Offer, and Compare (#286): tick two Offers and see their terms side by side.
export function OffersView({ items, applications }: { items: OfferItem[]; applications: Application[] }) {
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [pending, start] = useTransition();

  const pick = (offerId: string, on: boolean) => {
    setResult(null);
    setSelected((s) => (on ? [...s, offerId] : s.filter((x) => x !== offerId)));
  };
  const titleOf = (offerId: string) => items.find((i) => i.offer.id === offerId)?.applicationTitle ?? "Offer";

  return (
    <div className="grid gap-10">
      <section aria-labelledby="add-offer-heading" className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="add-offer-heading" className="text-lg font-semibold">
            Add an Offer
          </h2>
          <Button variant="outline" size="sm" aria-expanded={adding} aria-controls="add-offer-panel" onClick={() => setAdding(!adding)}>
            Add Offer
          </Button>
        </div>
        <div id="add-offer-panel" hidden={!adding} className="grid gap-4">
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add an Application first, then give it an Offer.</p>
          ) : (
            <>
              <div className="grid max-w-xl gap-1 text-sm font-medium">
                <label htmlFor="offer-application">Application</label>
                <select id="offer-application" value={picked} onChange={(e) => setPicked(e.target.value)} className={field}>
                  <option value="">Choose an Application</option>
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </div>
              {picked && (
                <OfferForm
                  key={picked}
                  mode="add"
                  applicationId={picked}
                  label="New Offer"
                  onSaved={() => {
                    setAdding(false);
                    setPicked("");
                  }}
                />
              )}
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="offers-heading" className="grid gap-4">
        <h2 id="offers-heading" className="text-lg font-semibold">
          Your Offers
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Offers yet. Add one when an Application gives you an offer.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p id="compare-hint" className="text-sm text-muted-foreground">
                Tick two Offers to compare them.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={selected.length !== 2 || pending}
                onClick={() => {
                  const [a, b] = selected;
                  start(async () => setResult(await compareOffers(a, b)));
                }}
              >
                Compare
              </Button>
            </div>
            <ul aria-describedby="compare-hint" className="grid gap-3">
              {items.map((item) => {
                const checked = selected.includes(item.offer.id);
                return (
                  <OfferRow
                    key={item.offer.id}
                    item={item}
                    compare={{ checked, disabled: !checked && selected.length >= 2, onChange: (on) => pick(item.offer.id, on) }}
                  />
                );
              })}
            </ul>
            {result && !result.ok && <Alert>{result.message}</Alert>}
            {result?.ok && (
              <ComparisonTable
                comparison={result.comparison}
                titles={[titleOf(result.comparison.a.id), titleOf(result.comparison.b.id)]}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ComparisonTable({ comparison, titles }: { comparison: Comparison; titles: [string, string] }) {
  const a = termRows(comparison.a.terms);
  const b = termRows(comparison.b.terms);
  return (
    <section aria-labelledby="comparison-heading" className="grid gap-3">
      <h3 id="comparison-heading" className="text-base font-semibold">
        Comparison
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">The two Offers side by side</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="py-2 pr-4 font-medium">
                <span className="sr-only">Term</span>
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {titles[0]}
              </th>
              <th scope="col" className="py-2 font-medium">
                {titles[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {a.map(([label, valueA], i) => (
              <tr key={label} className="border-b border-border align-top">
                <th scope="row" className="py-2 pr-4 text-left font-normal text-muted-foreground">
                  {label}
                </th>
                <td className="py-2 pr-4">{valueA}</td>
                <td className="py-2">{b[i][1]}</td>
              </tr>
            ))}
            <tr className="align-top">
              <th scope="row" className="py-2 pr-4 text-left font-normal text-muted-foreground">
                Checks
              </th>
              <td className="py-2 pr-4">{comparison.a.checks.length ? <ChecksList checks={comparison.a.checks} /> : "None"}</td>
              <td className="py-2">{comparison.b.checks.length ? <ChecksList checks={comparison.b.checks} /> : "None"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
