import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

const URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true };

export class CreateSubmissionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string;

  /** One-paragraph summary shown on gallery cards. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  /** Long description (Markdown is rendered as plain text for now). */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  repoUrl?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  demoVideoUrl?: string;

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  liveUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  techTags?: string[];

  /** Track id or fixture id (e.g. trk_01). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  track?: string;
}

/**
 * Send only what changes. `null` clears an optional field; the title can be changed but not
 * removed. Allowed until the event's deadline, also after submitting.
 */
export class UpdateSubmissionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  description?: string | null;

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  repoUrl?: string | null;

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  demoVideoUrl?: string | null;

  @IsOptional()
  @IsUrl(URL_OPTIONS)
  liveUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  techTags?: string[];

  /** Track id or fixture id (e.g. trk_01) of this event; `null` for no track. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  track?: string | null;
}

/** A submission as its team (and the event's organisers) see it, draft or submitted. */
export class SubmissionDto {
  id: string;
  /** Fixture id (e.g. prj_01) when imported from fixtures.json. */
  externalId: string | null;
  eventId: string;
  teamId: string;
  trackId: string | null;
  title: string;
  tagline: string | null;
  summary: string | null;
  description: string | null;
  repoUrl: string | null;
  demoVideoUrl: string | null;
  liveUrl: string | null;
  techTags: string[];
  /** DRAFT until a member submits it; SUBMITTED entries appear in the public gallery. */
  status: 'DRAFT' | 'SUBMITTED';
  /** When it was first submitted. */
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
