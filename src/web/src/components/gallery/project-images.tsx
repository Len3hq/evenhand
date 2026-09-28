import Image from 'next/image';
import type { Schemas } from '@/lib/api/types';

/**
 * A project's images: the cover large, the rest as thumbnails. Each opens the full image in a new
 * tab. Everything comes from the portal's own API, so it works offline and within the CSP.
 */
export function ProjectImages({
  title,
  images,
  className,
}: {
  title: string;
  images: Schemas['SubmissionImageDto'][];
  className?: string;
}) {
  const [cover, ...rest] = images;
  if (!cover) return null;
  return (
    <div className={className}>
      <a href={cover.url} target="_blank" rel="noopener" className="block">
        <Image
          src={cover.url}
          alt={`${title}: image 1 of ${images.length}`}
          width={cover.width}
          height={cover.height}
          className="h-auto max-h-[28rem] w-full rounded-lg border border-border bg-bg object-contain"
        />
      </a>
      {rest.length ? (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {rest.map((img, i) => (
            <li key={img.id}>
              <a href={img.url} target="_blank" rel="noopener" className="block">
                <Image
                  src={img.thumbUrl}
                  alt={`${title}: image ${i + 2} of ${images.length}`}
                  width={640}
                  height={400}
                  className="h-auto w-full rounded-md border border-border"
                />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
