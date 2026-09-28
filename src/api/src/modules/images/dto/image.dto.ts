import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';

/** An uploaded image: both URLs are served by the API from its own storage. */
export class SubmissionImageDto {
  id: string;
  /** The image, at most 1600 px on its longest side (WebP). */
  url: string;
  /** A 640 × 400 crop for cards (WebP). */
  thumbUrl: string;
  width: number;
  height: number;
}

export class ReorderImagesDto {
  /** Every image id of the submission, in the new order; the first becomes the cover. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  order: string[];
}
