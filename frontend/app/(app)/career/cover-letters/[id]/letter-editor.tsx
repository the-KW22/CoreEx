"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { type Template } from "@/lib/resume/blocks";
import { parseCss, partOf } from "@/lib/resume/custom-css";
import { resetDesign } from "@/lib/resume/design";
import { fitToPage } from "@/lib/resume/fit";
import { letterForPdf, letterWords } from "@/lib/resume/letter";
import { createMeasurer } from "@/lib/resume/measure";
import { takeNewestUnsaved, storeUnsaved, clearUnsaved } from "../../../notes/[id]/recovery";
import { Controls } from "../../resumes/[id]/controls";
import { Design } from "../../resumes/[id]/design";
import { photoData } from "../../resumes/[id]/actions";
import { Preview } from "../../resumes/[id]/preview";
import { RichText } from "../../resumes/[id]/rich-text";
import type { Action } from "../../resumes/[id]/store";
import { letterMarkdown, loadLetter, saveLetter, saveLetterCopy, unlinkLetter } from "./actions";
import { DraftPanel } from "./draft-panel";
import { LetterHistory } from "./history";

type Letter = components["schemas"]["Letter"];
type Document = components["schemas"]["CoverLetterDocument"];
const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";

export function LetterEditor({ initial, organise, backlinks }: { initial: Letter; organise: React.ReactNode; backlinks: React.ReactNode }) {
  const [title, setTitle] = useState(initial.title);
  const [doc, setDoc] = useState(initial.document);
  const [version, setVersion] = useState(initial.version);
  const [linked, setLinked] = useState(initial.linkedResumeId);
  const [mode, setMode] = useState<"write" | "design" | "history">("write");
  const [candidate, setCandidate] = useState<Template | null>(null);
  const [css, setCss] = useState<string | null>(null);
  const [status, setStatus] = useState<"saved" | "unsaved" | "saving" | "error" | "conflict">("saved");
  const [photo, setPhoto] = useState<{ id: string; src: string | null } | null>(null);
  const [generation, setGeneration] = useState(0);
  const [fitting, setFitting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [notice, setNotice] = useState("");
  const [session] = useState(() => Math.random().toString(36).slice(2));
  const saved = useRef(JSON.stringify([initial.title, initial.document]));
  const latest = useRef({ title, doc, version, status });
  const saving = useRef(false);
  useEffect(() => { latest.current = { title, doc, version, status }; });

  const flush = useCallback(async () => {
    const sent = latest.current;
    if (saving.current || sent.status === "conflict" || JSON.stringify([sent.title, sent.doc]) === saved.current) return;
    saving.current = true;
    setStatus("saving");
    const result = await saveLetter(initial.id, sent.title, sent.doc, sent.version).catch(() => ({ status: "error" as const }));
    saving.current = false;
    if (result.status !== "saved") { setStatus(result.status); return; }
    saved.current = JSON.stringify([sent.title, sent.doc]);
    setVersion(result.letter.version);
    const unchanged = JSON.stringify([latest.current.title, latest.current.doc]) === saved.current;
    if (unchanged) {
      saved.current = JSON.stringify([result.letter.title, result.letter.document]);
      setTitle(result.letter.title);
      setDoc(result.letter.document);
      clearUnsaved(initial.id, session);
    }
    setStatus(unchanged ? "saved" : "unsaved");
  }, [initial.id, session]);

  useEffect(() => {
    if (status === "conflict" || status === "error") return;
    if (JSON.stringify([title, doc]) === saved.current) return;
    storeUnsaved(initial.id, session, { title, body: JSON.stringify(doc), version, storedAt: Date.now() });
    const timer = setTimeout(() => void flush(), 1000);
    return () => clearTimeout(timer);
  }, [doc, flush, initial.id, session, status, title, version]);

  /* eslint-disable react-hooks/set-state-in-effect -- Recovery reads browser storage after hydration. */
  useEffect(() => {
    const recovered = takeNewestUnsaved(initial.id, Date.now());
    if (!recovered) return;
    try {
      const document = JSON.parse(recovered.body) as Document;
      setDoc(document);
      setTitle(recovered.title);
      setGeneration((n) => n + 1);
      setStatus(recovered.version === initial.version ? "unsaved" : "conflict");
      storeUnsaved(initial.id, session, recovered);
    } catch { /* A malformed recovery entry cannot be used. */ }
  }, [initial.id, initial.version, session]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const id = doc.sender.photo.assetId;
    if (!id) return;
    let current = true;
    void photoData(id).then((src) => { if (current) setPhoto({ id, src }); });
    return () => { current = false; };
  }, [doc.sender.photo.assetId]);

  useEffect(() => {
    if (!linked) return;
    let active = true;
    const refresh = async () => {
      if (document.hidden || saving.current || latest.current.status !== "saved") return;
      const result = await loadLetter(initial.id);
      if (!active || !result || saving.current || latest.current.status !== "saved") return;
      if (result.version !== latest.current.version) { setStatus("conflict"); return; }
      if (result.linkedResumeId !== linked) setLinked(result.linkedResumeId);
      const next = { ...latest.current.doc, sender: result.document.sender, design: result.document.design };
      if (JSON.stringify(next) !== JSON.stringify(latest.current.doc)) {
        saved.current = JSON.stringify([latest.current.title, next]);
        setDoc(next);
      }
    };
    const timer = setInterval(() => void refresh(), 5000);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [initial.id, linked]);

  const photoSrc = photo?.id === doc.sender.photo.assetId ? photo.src : null;
  const base = useMemo(() => letterForPdf(doc), [doc]);
  const shown = useMemo(() => candidate ? { ...base, metadata: { ...base.metadata, template: candidate } } : base, [base, candidate]);
  const set = (patch: Partial<Document>) => { setDoc((current) => ({ ...current, ...patch })); setStatus((current) => current === "conflict" ? current : "unsaved"); };
  const setDesign = (patch: Partial<Document["design"]>) => set({ design: { ...doc.design, ...patch } });
  const dispatch = (action: Action) => { if (action.type === "design") setDesign(action.patch); };
  const wordCount = letterWords(doc);

  async function fit() {
    setFitting(true);
    const measurer = createMeasurer(photoSrc, true);
    try {
      const result = await fitToPage(base, measurer.pagesFor);
      if (result) { setDesign(result.patch); setNotice("Fit to the intended pages."); }
      else setNotice("The letter cannot fit within the minimum text size and margins. Add a page or shorten it.");
    } catch { setNotice("Could not fit the page. Try again."); }
    finally { measurer.close(); setFitting(false); }
  }

  function select(ref: string) {
    if (picking) {
      setPicking(false);
      const part = partOf(ref);
      if (!part) return;
      const rules = css ?? doc.design.customCss;
      if (!new RegExp(`(^|[},\\s])${part}\\s*[,{]`).test(rules)) setCss(`${rules.trimEnd()}${rules.trim() ? "\n" : ""}${part} {\n  \n}\n`);
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-field="custom-css"]')?.focus());
      return;
    }
    setMode("write");
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(ref)}"]`);
      field?.scrollIntoView({ block: "center" });
      (field?.querySelector<HTMLElement>("[contenteditable=true]") ?? field)?.focus();
    });
  }

  async function unlink() {
    const result = await unlinkLetter(initial.id, version).catch(() => ({ status: "error" as const }));
    if (result.status !== "saved") { setStatus(result.status); return; }
    setDoc(result.letter.document); setVersion(result.letter.version); setLinked(null);
    saved.current = JSON.stringify([result.letter.title, result.letter.document]);
  }

  return <div className="grid gap-6">
    <header className="grid gap-4">
      <Link href="/career/cover-letters" className="text-sm underline underline-offset-2">Back to Cover Letters</Link>
      <label className="grid gap-1 font-medium">Cover Letter name<input value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); setStatus((current) => current === "conflict" ? current : "unsaved"); }} className={input} /></label>
      <p role="status">{status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "conflict" ? "Changed in another tab. Your text is kept on this device." : status === "error" ? "Not saved. Try again." : "Unsaved changes"}</p>
      {notice && <p role="status">{notice}</p>}
      {status === "error" && <Button type="button" variant="outline" onClick={() => { setStatus("unsaved"); }}>Retry</Button>}
      {status === "conflict" && <Button type="button" variant="outline" onClick={() => void (async () => {
        if (await saveLetterCopy(title, doc)) { clearUnsaved(initial.id, session); window.location.reload(); }
        else setNotice("Could not save your copy. Your text remains on this device; try again.");
      })()}>Keep a copy and reload</Button>}
      {organise}{backlinks}
      <nav aria-label="Mode" className="flex gap-2"><Button type="button" variant={mode === "write" ? "secondary" : "outline"} onClick={() => { setMode("write"); setCandidate(null); }}>Write</Button><Button type="button" variant={mode === "design" ? "secondary" : "outline"} onClick={() => setMode("design")}>Design</Button><Button type="button" variant={mode === "history" ? "secondary" : "outline"} onClick={() => { setMode("history"); setCandidate(null); }}>History</Button></nav>
    </header>
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {mode === "write" ? <div className="grid min-w-0 content-start gap-4">
        {linked && <div className="flex flex-wrap items-center gap-2"><p>Sender and design follow the linked Resume.</p><Button type="button" variant="outline" disabled={status !== "saved"} onClick={() => void unlink()}>Unlink</Button></div>}
        <fieldset disabled={!!linked} className="grid gap-2"><legend className="font-semibold">Sender</legend>
          {(["name", "headline", "email", "phone", "location", "website"] as const).map((field) => <label key={field} className="grid gap-1 text-sm font-medium">{field === "name" ? "Name" : field === "headline" ? "Headline" : field === "email" ? "Email" : field === "phone" ? "Phone" : field === "location" ? "Location" : "Website"}<input data-field={`basics.${field}`} value={doc.sender[field]} onChange={(e) => set({ sender: { ...doc.sender, [field]: e.target.value } })} className={input} /></label>)}
        </fieldset>
        {(["recipient", "date", "greeting"] as const).map((field) => <label key={field} className="grid gap-1 text-sm font-medium">{field === "recipient" ? "Recipient" : field === "date" ? "Date" : "Greeting"}<input value={doc[field]} onChange={(e) => set({ [field]: e.target.value })} className={input} /></label>)}
        <RichText key={generation} label="Body" field="summary" html={doc.body} onChange={(body) => set({ body })} ownHistory />
        <label className="grid gap-1 text-sm font-medium">Sign-off<input value={doc.signOff} onChange={(event) => set({ signOff: event.target.value })} className={input} /></label>
        <p role="status" className="text-sm text-muted-foreground">{wordCount} words · suggested range 180–320</p>
        <DraftPanel id={initial.id} version={version} ready={status === "saved"} linkedResume={linked} onAccept={(letter) => {
          setDoc(letter.document); setTitle(letter.title); setVersion(letter.version); setGeneration((n) => n + 1);
          saved.current = JSON.stringify([letter.title, letter.document]); setStatus("saved"); clearUnsaved(initial.id, session);
        }} />
      </div> : mode === "history" ? <LetterHistory id={initial.id} version={version} ready={status === "saved"} onRestore={(letter) => {
        setDoc(letter.document); setTitle(letter.title); setVersion(letter.version); setLinked(letter.linkedResumeId); setGeneration((n) => n + 1);
        saved.current = JSON.stringify([letter.title, letter.document]); setStatus("saved"); clearUnsaved(initial.id, session);
      }} /> : <fieldset disabled={!!linked} className="grid min-w-0 content-start gap-6 border-0 p-0">
        {linked && <p>Unlink the Resume to edit this design.</p>}
        <Design doc={base} candidate={candidate} locked={false} photoSrc={photoSrc} letter onCandidate={setCandidate} onApply={(template) => { setDesign({ template }); setCandidate(null); }} />
        <Controls doc={base} dispatch={dispatch} onReset={() => set({ design: resetDesign(doc.design) })} css={css ?? doc.design.customCss} onCss={(text) => { setCss(text); if (!parseCss(text).problems.length) { setDesign({ customCss: text }); setCss(null); } }} picking={picking} onPicking={() => setPicking(!picking)} />
      </fieldset>}
      <Preview doc={shown} letterDocument={doc} title={title} onSelect={select} photoSrc={photoSrc} pins={[]} checkMode={false} fitting={fitting || !!linked}
        onFit={() => void fit()} onAddPage={() => setDesign({ pageCount: doc.design.pageCount + 1 })} markdownAvailable={status === "saved"}
        onMarkdown={async () => { const result = await letterMarkdown(initial.id); return result?.version === latest.current.version ? result.markdown ?? null : null; }} />
    </div>
  </div>;
}
