"use client";

import { useEffect } from "react";

import { type OpenItem, recordAction, setOpenItem, type TrailAction } from "@/lib/chat-context";

// Tells Chat which Item is open, and puts the opening (or the creating) on the session trail. Renders nothing. The title is
// read once per Item: a refresh of the same page must not record a second opening.
export function PageContext({ kind, id, title, created = false }: OpenItem & { created?: boolean }) {
  useEffect(() => {
    setOpenItem({ kind, id, title });
    const action: TrailAction = created ? "CREATED" : "OPENED";
    recordAction({ action, kind, id, title });
    return () => setOpenItem(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);
  return null;
}

// Puts a search on the session trail. Renders nothing.
export function SearchTrail({ q }: { q: string }) {
  useEffect(() => {
    if (q) recordAction({ action: "SEARCHED", kind: "SEARCH", title: q });
  }, [q]);
  return null;
}
