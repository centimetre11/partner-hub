"use client";

import { useActionState, useEffect, useState } from "react";
import { createFeedbackAction } from "@/lib/feedback-actions";
import { useMessages } from "@/lib/i18n/context";

const input =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400";

type UploadedImage = { id: string; filename: string; previewUrl?: string };

function ImageUploadField({
  images,
  onChange,
}: {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
}) {
  const m = useMessages();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setLoading(true);
    setError(null);
    try {
      const uploaded: UploadedImage[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        uploaded.push({ id: data.asset.id, filename: data.asset.filename, previewUrl });
      }
      onChange([...images, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  function removeImage(id: string) {
    const img = images.find((i) => i.id === id);
    if (img?.previewUrl) URL.revokeObjectURL(img.previewUrl);
    onChange(images.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{m.feedback.imagesLabel}</span>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={uploadFiles}
          disabled={loading}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
        />
      </label>
      {loading && <span className="text-xs text-slate-400">{m.feedback.uploading}</span>}
      {error && <span className="block text-xs text-red-500">{error}</span>}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group">
              {img.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.previewUrl} alt={img.filename} className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
              ) : (
                <div className="h-16 w-16 rounded-lg bg-slate-100 flex items-center justify-center text-xs text-slate-500 border border-slate-200">
                  📎
                </div>
              )}
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100"
                aria-label={m.feedback.removeImage}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackForm({ onClose }: { onClose: () => void }) {
  const m = useMessages();
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [state, action, pending] = useActionState(
    async (_: unknown, formData: FormData) => {
      images.forEach((img) => formData.append("assetIds", img.id));
      return createFeedbackAction(formData);
    },
    null,
  );

  useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <form action={action} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-xs text-slate-500">{m.feedback.descLabel}</span>
        <textarea
          name="description"
          rows={5}
          placeholder={m.feedback.descPlaceholder}
          className={`${input} resize-y min-h-[120px]`}
        />
      </label>
      <ImageUploadField images={images} onChange={setImages} />
      {state?.error && (
        <p className="text-xs text-red-600">
          {state.error === "content_required" ? m.feedback.contentRequired : state.error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">
          {m.common.cancel}
        </button>
        <button
          disabled={pending}
          className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? m.feedback.submitting : m.feedback.submit}
        </button>
      </div>
    </form>
  );
}

export function FeedbackFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useMessages();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg w-full border border-slate-200 max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold mb-1">{m.feedback.modalTitle}</h3>
        <p className="text-xs text-slate-500 mb-4">{m.feedback.modalDesc}</p>
        <FeedbackForm onClose={onClose} />
      </div>
    </div>
  );
}

export function FeedbackButton({ onOpen }: { onOpen?: () => void }) {
  const m = useMessages();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
        className="flex w-full items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      >
        <span className="text-base w-5 text-center">💬</span>
        <span>{m.feedback.entryLabel}</span>
      </button>
      <FeedbackFormModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
