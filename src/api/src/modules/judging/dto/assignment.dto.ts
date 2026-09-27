import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class RunAssignmentDto {
  /** Reviews wanted per project (default 3). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  target?: number;

  /** Seed for the random tie-breaks, to reproduce a run. A fresh one is drawn when omitted. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4294967295)
  seed?: number;
}

export class AssignmentJudgeDto {
  judgeId: string;
  name: string;
  /** Assigned in this run. */
  added: number;
  /** Assigned in total, across all runs. */
  total: number;
}

export class AssignmentShortfallDto {
  projectId: string;
  title: string;
  /** Reviews it has after the run. */
  have: number;
  /** Judges who could review it at all (covering its track, without a conflict). */
  eligibleJudges: number;
}

export class AssignmentRunDto {
  batch: string;
  seed: number;
  target: number;
  /** Projects in judging: submitted, eligible, not a replaced or held duplicate copy. */
  projects: number;
  added: number;
  judges: AssignmentJudgeDto[];
  shortfalls: AssignmentShortfallDto[];
  /**
   * Connected groups of judges who share projects. Above 1, some judges' leniency cannot be
   * compared with the others'.
   */
  components: number;
}
