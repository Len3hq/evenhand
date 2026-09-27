import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTrackDto {
  /** Unique within the event. */
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;
}

export class UpdateTrackDto extends CreateTrackDto {}

export class CreatePrizeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** The track this prize is for (id or fixture id, e.g. trk_01). Omit for an overall prize. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  track?: string;
}

/** Send only what changes. `track: null` makes it an overall prize; `description: null` clears it. */
export class UpdatePrizeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  track?: string | null;
}
