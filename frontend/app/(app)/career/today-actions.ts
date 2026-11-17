"use server";

import { getApi } from "@/lib/api/server";

import { runPrep, type Outcome } from "./applications/[id]/interview-actions";

// Practice 3 questions: its questions are the first three of the Interview prep for this interview, so the prep is
// made first when the Application has none yet (the same call as "Generate briefing now").
export async function prepareForPractice(id: string, seq: number): Promise<Outcome> {
  const api = await getApi();
  const results = await api.GET("/api/applications/{id}/career/results", { params: { path: { id } } }).catch(() => null);
  if (!results?.data) return { ok: false, message: "Cannot reach the CoreEx API." };
  if (results.data.results.some((r) => r.kind === "PREP" && r.prep.interviewSeq === seq)) return { ok: true };
  return runPrep(id, seq);
}
