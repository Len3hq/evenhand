import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_QUESTIONS } from '../../events/question-rules.js';

const URL_OPTIONS = { protocols: ['http', 'https'], require_protocol: true };

/** An answer to one of the event's custom questions (`GET /events/:eventRef/questions`). */
export class AnswerInputDto {
  /** The question's id (or the id it was imported under). */
  @IsString()
  @MaxLength(100)
  question: string;

  /** The answer; `null` or blank text clears it. */
  @ValidateIf((o: AnswerInputDto) => o.value !== null)
  @IsString()
  @MaxLength(5000)
  value: string | null;
}

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

  /** Answers to the event's custom questions. Questions left out keep their answer. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => AnswerInputDto)
  answers?: AnswerInputDto[];
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

  /** Answers to the event's custom questions. Questions left out keep their answer. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => AnswerInputDto)
  answers?: AnswerInputDto[];
}

export class SubmissionAnswerDto {
  questionId: string;
  value: string;
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
  /** Its answers to the event's custom questions, in question order; unanswered ones are absent. */
  answers: SubmissionAnswerDto[];
  /** DRAFT until a member submits it; SUBMITTED entries appear in the public gallery. */
  status: 'DRAFT' | 'SUBMITTED';
  /** When it was first submitted. */
  submittedAt: string | null;
  /** DISQUALIFIED by the organisers: out of the gallery, judging and rankings. */
  eligibility: 'ELIGIBLE' | 'DISQUALIFIED';
  /** The organisers' reason; null unless disqualified. */
  disqualifyReason: string | null;
  /** The team's newer entry that replaced this one as a confirmed duplicate, if any. */
  supersededById: string | null;
  /** The older copy of a suspected duplicate, waiting for the organisers' decision. */
  duplicateHold: boolean;
  createdAt: string;
  updatedAt: string;
}
