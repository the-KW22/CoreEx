"use client";

import { useEffect } from "react";

import { recordOpened } from "./actions";

// Tells the API the User opened this Item, so the quick switcher can list it among the recent ones. Renders nothing.
export function RecordOpen({ id }: { id: string }) {
  useEffect(() => {
    void recordOpened(id);
  }, [id]);
  return null;
}
