import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTeamDto {
  /** Unique within the event. */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

export class TeamMemberDto {
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
}

export class TeamDto {
  id: string;
  /** Fixture id (e.g. tm_01) when imported from fixtures.json. */
  externalId: string | null;
  eventId: string;
  name: string;
  members: TeamMemberDto[];
  /** The team's current submission in this event (draft or submitted), if it has one. */
  submissionId: string | null;
}

export class InviteDto {
  /** The secret. Shown only in this response; the server keeps a hash. */
  token: string;
  /** Path to share, relative to the portal, e.g. /invites/<token>. */
  path: string;
  expiresAt: string;
  maxUses: number;
}

/** What someone holding the link sees before joining. No member details. */
export class InvitePreviewDto {
  teamName: string;
  eventName: string;
  eventSlug: string;
  expiresAt: string;
  usesLeft: number;
}
