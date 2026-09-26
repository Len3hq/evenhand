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

export class SubmissionDto {
  id: string;
  eventId: string;
  teamId: string;
  title: string;
  status: 'DRAFT' | 'SUBMITTED';
  createdAt: string;
}
