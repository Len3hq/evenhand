'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, useRef, useState } from 'react';
import { Badge, Button, ErrorState } from '@/components/ui';
import { apiDelete, apiPut, apiUpload } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

type Img = Schemas['SubmissionImageDto'];

/** The API's rules (IMAGE_RULES in the images module), repeated for the explanation below. */
const MAX_IMAGES = 6;
const MAX_MB = 8;

/**
 * A team's images: upload, choose the cover, remove. The API re-encodes every upload and
 * decides what is allowed (type, size, count, team, deadline); this only shows the result.
 */
export function ImageManager({
  submissionId,
  images,
  readOnly,
}: {
  submissionId: string;
  images: Img[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/submissions/${submissionId}/images` as const;

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    if (!files.length) return;
    // One request per file, in order, so each gets its own answer.
    void act(async () => {
      for (const file of files) await apiUpload(base, file);
    });
  }

  const makeCover = (id: string) =>
    act(() =>
      apiPut(`${base}/order`, {
        order: [id, ...images.filter((i) => i.id !== id).map((i) => i.id)],
      }),
    );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Up to {MAX_IMAGES} images (JPEG, PNG or WebP, {MAX_MB} MB each). The first is the cover in
        the gallery. Every image is re-encoded, which removes its metadata, such as the camera and
        the location a photo was taken.
      </p>
      {images.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, index) => (
            <li key={img.id} className="space-y-2">
              <div className="relative overflow-hidden rounded-md border border-border">
                <Image
                  src={img.thumbUrl}
                  alt={`Image ${index + 1} of ${images.length}`}
                  width={640}
                  height={400}
                  className="h-auto w-full"
                />
                {index === 0 ? (
                  <span className="absolute left-2 top-2">
                    <Badge tone="accent">Cover</Badge>
                  </span>
                ) : null}
              </div>
              {readOnly ? null : (
                <div className="flex flex-wrap gap-2">
                  {index > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      disabled={busy}
                      onClick={() => void makeCover(img.id)}
                    >
                      Make cover
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    className="px-2 py-1 text-xs"
                    disabled={busy}
                    aria-label={`Remove image ${index + 1}`}
                    onClick={() => {
                      if (window.confirm('Remove this image?')) {
                        void act(() => apiDelete(`${base}/${img.id}`));
                      }
                    }}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No images yet.</p>
      )}
      {readOnly ? null : (
        <div>
          <label htmlFor="image-upload" className="sr-only">
            Add images
          </label>
          <input
            ref={input}
            id="image-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            onChange={onPick}
            disabled={busy || images.length >= MAX_IMAGES}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy || images.length >= MAX_IMAGES}
            onClick={() => input.current?.click()}
          >
            {busy ? 'Working…' : images.length >= MAX_IMAGES ? 'Image limit reached' : 'Add images'}
          </Button>
        </div>
      )}
      {error ? <ErrorState title="Not saved" message={error} /> : null}
    </div>
  );
}
