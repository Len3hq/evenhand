import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const VOTING_MODES = ['ACCOUNTS', 'EMAIL_LIST', 'OPEN_LINK'] as const;
export type VotingModeName = (typeof VOTING_MODES)[number];

export class ConfigureVotingDto {
  /**
   * Who may vote: ACCOUNTS (anyone logged in), EMAIL_LIST (a personal link per listed email)
   * or OPEN_LINK (a shared link that hands each visitor a personal link).
   */
  @IsIn(VOTING_MODES)
  mode: VotingModeName;

  /** When votes start counting (ISO 8601 with a time zone). */
  @IsISO8601({ strict: true })
  opensAt: string;

  /** When votes stop counting; after opensAt. */
  @IsISO8601({ strict: true })
  closesAt: string;

  /** How many different projects one voter may vote for (1 to 10). */
  @IsInt()
  @Min(1)
  @Max(10)
  votesPerVoter: number;
}

export class IssuePassesDto {
  /** The voters' emails; each gets one personal voting link. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(254, { each: true })
  emails: string[];
}

export class CastVoteDto {
  /** The project: its id or fixture id. */
  @IsString()
  @MaxLength(100)
  project: string;
}

export class VotingRoundDto {
  mode: VotingModeName;
  opensAt: string;
  closesAt: string;
  votesPerVoter: number;
  /** True while votes are counted (server clock). */
  open: boolean;
  /** True once the window has passed: results can be published. */
  closed: boolean;
  /** OPEN_LINK: whether a shared link exists (its secret is shown only when it is made). */
  hasLink: boolean;
  resultsPublishedAt: string | null;
}

export class VoteTallyDto {
  projectId: string;
  externalId: string | null;
  title: string;
  teamName: string;
  votes: number;
}

export class AdminVoteTallyDto extends VoteTallyDto {
  /** Of `votes`, those from ballots taken by an address that took more than one (shared link). */
  repeatVotes: number;
}

export class VotingAdminDto {
  /** Null until the organisers set up a vote. */
  round: VotingRoundDto | null;
  ballots: number;
  votes: number;
  /** Personal voting links made so far (email list and open link). */
  passes: number;
  /**
   * Shared link: ballots whose address is known. Zero when no proxy in front of the portal
   * reports voters' addresses, and then repeats cannot be detected by address.
   */
  passesWithAddress: number;
  /** Shared link: addresses that took more than one ballot. The addresses are not shown. */
  repeatAddresses: number;
  /** Shared link: the ballots those addresses took. */
  repeatBallots: number;
  /** Every project in the vote, most votes first. Organisers only until results are published. */
  tallies: AdminVoteTallyDto[];
}

export class IssuedPassDto {
  email: string;
  /** The secret for this voter's link, /vote/<token>. Shown once; only its hash is stored. */
  token: string;
}

export class IssuedPassesDto {
  created: IssuedPassDto[];
  /** Emails that already had a link (their link is unchanged) or are not email addresses. */
  skipped: string[];
}

export class VotingLinkDto {
  /** The shared link's secret, /vote/link/<token>. Shown once; making a new one retires it. */
  token: string;
}

export class TakenPassDto {
  /** The secret of the voter's personal link, /vote/<token>. */
  token: string;
  /** True when this browser had already taken this ballot and gets the same one back. */
  reused: boolean;
}

export class BallotProjectDto {
  id: string;
  externalId: string | null;
  title: string;
  tagline: string | null;
  teamName: string;
  track: string | null;
  thumbnailUrl: string | null;
  /** This ballot has a vote for it. */
  voted: boolean;
  /** The voter is on this project's team, so cannot vote for it. */
  own: boolean;
}

export class BallotDto {
  eventName: string;
  eventSlug: string;
  mode: VotingModeName;
  open: boolean;
  /** True once the window has passed. */
  closed: boolean;
  opensAt: string;
  closesAt: string;
  votesPerVoter: number;
  votesLeft: number;
  /** In this ballot's own random order, the same every time it is opened. */
  projects: BallotProjectDto[];
}

export class VotingResultDto {
  projectId: string;
  externalId: string | null;
  title: string;
  teamName: string;
  votes: number;
}

export class PublicVotingResultsDto {
  eventName: string;
  closedAt: string;
  publishedAt: string;
  ballots: number;
  rows: VotingResultDto[];
}

export class PublicVotingStatusDto {
  mode: VotingModeName;
  opensAt: string;
  closesAt: string;
  /** True while votes are counted (server clock). */
  open: boolean;
  /** The results page has something to show. */
  resultsPublished: boolean;
}
