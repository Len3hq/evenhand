import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateJudgeInviteDto {
  /** Tracks the judge will cover (ids or fixture ids). Required when the event has tracks. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tracks: string[];

  /** How many people can accept it: 1 for one person (default), more for a panel link. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxUses?: number;

  /** Days until it expires (default 7). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;
}

export class JudgeTracksDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tracks: string[];
}

export class JudgeTrackRefDto {
  id: string;
  externalId: string | null;
  name: string;
}

export class JudgeInviteDto {
  /** The secret. Shown only in this response; the server keeps a hash. */
  token: string;
  /** Path to share, e.g. /judge-invites/<token>. */
  path: string;
  expiresAt: string;
  maxUses: number;
  tracks: JudgeTrackRefDto[];
}

export class JudgeInvitePreviewDto {
  eventName: string;
  eventSlug: string;
  tracks: string[];
  expiresAt: string;
  usesLeft: number;
}

export class JoinedAsJudgeDto {
  eventId: string;
  eventSlug: string;
  judgeId: string;
}

export class JudgeDto {
  /** The judge's id in this event (their event role). */
  judgeId: string;
  /** Fixture id (e.g. jdg_24) for judges imported from fixtures.json. */
  externalId: string | null;
  userId: string;
  name: string;
  email: string;
  tracks: JudgeTrackRefDto[];
  /** Projects assigned to them, and how many of those they have finished. */
  assigned: number;
  finished: number;
  since: string;
}
