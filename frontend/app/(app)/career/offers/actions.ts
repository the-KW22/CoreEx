"use server";

import type { components } from "@/lib/api/schema";
import { getApi } from "@/lib/api/server";
import type { OfferRequest } from "@/lib/career/offer-form";
import { done } from "@/lib/refresh";

type Offer = components["schemas"]["OfferResponse"];
type Comparison = components["schemas"]["Comparison"];

export type OfferResult = { ok: true; offer: Offer } | { ok: false; conflict: boolean; message: string };
export type CompareResult = { ok: true; comparison: Comparison } | { ok: false; message: string };
export type VersionsResult = { ok: true; versions: OfferVersion[] } | { ok: false; message: string };

export type OfferVersion = components["schemas"]["OfferVersion"];

const unreachable = { ok: false as const, conflict: false, message: "Cannot reach the CoreEx API." };

// The API's own message, or nothing; the error type is not declared for every route.
const reason = (error: unknown) => (error as { message?: string } | undefined)?.message;

export async function createOffer(applicationId: string, body: OfferRequest): Promise<OfferResult> {
  const api = await getApi();
  const result = await api.POST("/api/applications/{id}/offers", { params: { path: { id: applicationId } }, body }).catch(() => null);
  if (!result) return unreachable;
  if (result.data) {
    done(true);
    return { ok: true, offer: result.data };
  }
  return { ok: false, conflict: false, message: reason(result.error) ?? "Something went wrong. Try again." };
}

export async function updateOffer(offerId: string, body: OfferRequest): Promise<OfferResult> {
  const api = await getApi();
  const result = await api.PUT("/api/offers/{offerId}", { params: { path: { offerId } }, body }).catch(() => null);
  if (!result) return unreachable;
  if (result.data) {
    done(true);
    return { ok: true, offer: result.data };
  }
  const conflict = result.response.status === 409;
  return {
    ok: false,
    conflict,
    message: conflict
      ? "This Offer changed since you opened it. Reload the page to see the latest terms, then edit again."
      : reason(result.error) ?? "Something went wrong. Try again.",
  };
}

export async function listVersions(offerId: string): Promise<VersionsResult> {
  const api = await getApi();
  const result = await api.GET("/api/offers/{offerId}/versions", { params: { path: { offerId } } }).catch(() => null);
  if (!result) return { ok: false, message: "Cannot reach the CoreEx API." };
  if (!result.data) return { ok: false, message: reason(result.error) ?? "Could not load earlier versions." };
  return { ok: true, versions: result.data.items };
}

// Two Offers side by side. Refused (422) when they are in different currencies or pay periods; never converted.
export async function compareOffers(a: string, b: string): Promise<CompareResult> {
  const api = await getApi();
  const result = await api.GET("/api/offers/compare", { params: { query: { a, b } } }).catch(() => null);
  if (!result) return { ok: false, message: "Cannot reach the CoreEx API." };
  if (result.data) return { ok: true, comparison: result.data };
  return { ok: false, message: reason(result.error) ?? "These Offers cannot be compared." };
}
