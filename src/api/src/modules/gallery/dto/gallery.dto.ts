import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../core/pagination.js';

export class GalleryQueryDto extends PageQueryDto {
  /** Free-text search over title, tagline and summary (case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** Only projects in this track (internal id or fixture id, e.g. trk_01). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  track?: string;

  /** Only projects with this tech tag. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tag?: string;

  /** Only projects in this event (id, fixture id or slug). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  event?: string;
}

export class TrackRefDto {
  id: string;
  externalId: string | null;
  name: string;
}

export class ProjectSummaryDto {
  id: string;
  /** Fixture id (e.g. prj_01) when imported from fixtures.json. */
  externalId: string | null;
  eventId: string;
  title: string;
  tagline: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  techTags: string[];
  track: TrackRefDto | null;
  teamName: string;
  submittedAt: string | null;
}

export class ProjectPageDto {
  items: ProjectSummaryDto[];
  page: number;
  pageSize: number;
  total: number;
}

/** A custom question and the team's answer to it. */
export class ProjectAnswerDto {
  prompt: string;
  value: string;
}

export class ProjectDetailDto extends ProjectSummaryDto {
  description: string | null;
  repoUrl: string | null;
  demoVideoUrl: string | null;
  liveUrl: string | null;
  imageUrls: string[];
  /** Answers to the event's public questions, in question order. Private answers never appear. */
  answers: ProjectAnswerDto[];
}
