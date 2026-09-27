import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CriterionInputDto {
  /** Stable machine name, e.g. `functionality`. Derived from the label when omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z][a-z0-9_]*$/, { message: 'key must be lower-case letters, digits and _' })
  key?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;

  /** Relative weight: shares are weight / sum of weights. */
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1000)
  weight: number;

  @IsInt()
  @Min(0)
  @Max(100)
  min: number;

  @IsInt()
  @Min(1)
  @Max(100)
  max: number;
}

/** The whole rubric, in display order. Replaces what is there. */
export class RubricInputDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CriterionInputDto)
  criteria: CriterionInputDto[];
}

export class CriterionDto {
  key: string;
  label: string;
  weight: number;
  min: number;
  max: number;
  order: number;
  /** weight / sum of weights, e.g. 0.5 for half of the score. */
  share: number;
}

export class RubricDto {
  criteria: CriterionDto[];
  /**
   * True once any review is final: criteria can then no longer be added or removed and ranges
   * cannot change (existing scores would stop fitting). Labels and weights stay editable.
   */
  locked: boolean;
}
