"use client";

import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch } from "react";

import { Button } from "@/components/ui/button";
import type { Photo } from "@/lib/resume/design";

import { finishUpload, startUpload } from "../../../assets/actions";
import { put } from "../../../assets/upload-files";
import { type ImageAsset, imageAssets } from "./actions";
import { NumberField } from "./controls";
import type { Action } from "./store";

const select = "h-9 w-full rounded-lg border border-border bg-surface px-2";

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-9 w-full" />
    </label>
  );
}

// The photo in Write mode, inside its card (which gives it the heading): pick one of your PNG or JPEG Assets or upload a
// new one (kept as an Asset, so it can be reused), then its frame (show, size, shape) and crop (where the picture sits in
// the frame, and how much it is zoomed).
export function PhotoSection({ photo, photoSrc, dispatch }: { photo: Photo; photoSrc: string | null; dispatch: Dispatch<Action> }) {
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Photo>) => dispatch({ type: "photo", patch });

  useEffect(() => {
    let current = true;
    void imageAssets().then((list) => current && setAssets(list));
    return () => {
      current = false;
    };
  }, []);

  // The three steps of an upload, as on the Assets page: ask the API, PUT the file to Storage, tell the API it arrived.
  async function upload(chosen: File) {
    setBusy(true);
    setMessage("");
    try {
      const started = await startUpload(chosen.name, chosen.type, chosen.size, null);
      if (!started.ok) return setMessage(started.message);
      if (!(await put(started.uploadUrl, chosen, () => {}).catch(() => false))) return setMessage("The photo could not be uploaded.");
      const done = await finishUpload(started.uploadId);
      if (!done.ok) return setMessage(done.message);
      set({ assetId: done.id, visible: true });
      setAssets(await imageAssets());
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  const has = photo.assetId !== "";
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface text-muted-foreground">
          {has && photoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL made on the server, not a file to optimise
            <img src={photoSrc} alt="Your photo" className="size-full object-cover" />
          ) : (
            <ImageIcon aria-hidden className="size-6" />
          )}
        </div>
        <div className="grid flex-1 gap-2">
          <label className="grid gap-1 text-sm font-medium">
            Choose from your Assets
            <select
              value={assets.some((a) => a.id === photo.assetId) ? photo.assetId : ""}
              onChange={(e) => e.target.value && set({ assetId: e.target.value, visible: true })}
              className={select}
            >
              <option value="">{assets.length === 0 ? "No PNG or JPEG Assets yet" : "Pick an image…"}</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              aria-label="Upload a photo"
              onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
            />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => file.current?.click()}>
              <UploadIcon aria-hidden />
              {busy ? "Uploading…" : "Upload a photo"}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!has} onClick={() => set({ assetId: "" })}>
              <Trash2Icon aria-hidden />
              Remove photo
            </Button>
          </div>
        </div>
      </div>
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {has && !photoSrc && (
        <p role="status" className="text-sm text-muted-foreground">
          The picture cannot be shown (the Asset may be gone, or not a PNG or JPEG), so the page has no photo.
        </p>
      )}
      {has && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
            <input type="checkbox" className="size-6" checked={photo.visible} onChange={(e) => set({ visible: e.target.checked })} />
            Show the photo on the page
          </label>
          <NumberField label="Size (pt)" value={photo.size} min={30} max={160} onChange={(size) => set({ size })} />
          <label className="grid gap-1 text-sm font-medium">
            Shape
            <select value={photo.shape} onChange={(e) => set({ shape: e.target.value })} className={select}>
              <option value="circle">Circle</option>
              <option value="rounded">Rounded square</option>
              <option value="square">Square</option>
            </select>
          </label>
          <Slider label="Crop: across" value={photo.cropX} min={0} max={100} onChange={(cropX) => set({ cropX })} />
          <Slider label="Crop: down" value={photo.cropY} min={0} max={100} onChange={(cropY) => set({ cropY })} />
          <Slider label="Zoom (%)" value={photo.zoom} min={100} max={300} onChange={(zoom) => set({ zoom })} />
        </div>
      )}
    </div>
  );
}
