"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { formatLocal } from "@/lib/applications";

import { listVersions, type OfferVersion } from "./actions";
import { OfferForm } from "./offer-form";
import { ChecksList, TermsList } from "./terms";

type OfferItem = components["schemas"]["OfferItem"];

// One Offer: its Application, terms, checks, the form to edit it, and its earlier versions.
export function OfferRow({
  item,
  compare,
}: {
  item: OfferItem;
  compare: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void };
}) {
  const [editing, setEditing] = useState(false);
  const { offer } = item;
  const id = useId();
  return (
    <li className="grid gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            aria-label={item.applicationTitle}
            checked={compare.checked}
            disabled={compare.disabled}
            onChange={(e) => compare.onChange(e.target.checked)}
            className="mt-1 size-4"
          />
          <div className="grid gap-0.5">
            <Link href={`/career/applications/${item.applicationId}`} className="font-medium underline-offset-4 hover:underline">
              {item.applicationTitle}
            </Link>
            <p className="text-sm text-muted-foreground">
              {item.company} · {item.role}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" aria-label={`Edit ${item.applicationTitle}`} aria-expanded={editing} aria-controls={`${id}-edit`} onClick={() => setEditing(!editing)}>
          Edit
        </Button>
      </div>

      {editing ? (
        <div id={`${id}-edit`}>
          <OfferForm mode="edit" offer={offer} label={`Edit the Offer for ${item.applicationTitle}`} />
        </div>
      ) : (
        <div id={`${id}-edit`} className="grid gap-3">
          <TermsList terms={offer.terms} />
          {offer.checks.length > 0 && <ChecksList checks={offer.checks} />}
        </div>
      )}
      {/* Keyed by version: after a save, the earlier versions load again the next time they are opened. */}
      <EarlierVersions key={offer.version} offerId={offer.id} title={item.applicationTitle} />
    </li>
  );
}

function EarlierVersions({ offerId, title }: { offerId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<OfferVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();

  const toggle = () => {
    setOpen(!open);
    if (open || versions !== null) return;
    start(async () => {
      const result = await listVersions(offerId);
      if (result.ok) setVersions(result.versions);
      else setError(result.message);
    });
  };

  return (
    <div className="grid gap-2">
      <Button variant="ghost" size="sm" className="justify-self-start" aria-label={`Earlier versions of ${title}`} aria-expanded={open} aria-controls={id} onClick={toggle}>
        Earlier versions
      </Button>
      <div id={id} hidden={!open} className="grid gap-3">
        {pending && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <Alert>{error}</Alert>}
        {versions?.length === 0 && <p className="text-sm text-muted-foreground">No earlier versions yet.</p>}
        {versions && versions.length > 0 && (
          <ol aria-label="Earlier versions" className="grid gap-3">
            {versions.map((v) => (
              <li key={v.version} className="grid gap-1 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">
                  Version {v.version}, saved {formatLocal(v.savedAt)}
                </p>
                <TermsList terms={v.terms} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
