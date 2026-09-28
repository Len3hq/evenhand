import type { SubmissionImageDto } from './dto/image.dto.js';

/** Where the API serves an image and its thumbnail (GET /api/images/:id[/thumb]). */
export const imageUrl = (id: string): string => `/api/images/${id}`;

export function toImageDto(i: { id: string; width: number; height: number }): SubmissionImageDto {
  return {
    id: i.id,
    url: imageUrl(i.id),
    thumbUrl: `${imageUrl(i.id)}/thumb`,
    width: i.width,
    height: i.height,
  };
}

/** Image order for every query: the cover first; the id breaks ties deterministically. */
export const IMAGE_ORDER = [{ order: 'asc' as const }, { id: 'asc' as const }];
