import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_QUESTIONS } from '../question-rules.js';

export class QuestionInputDto {
  /** The question this row keeps (its id, or the id it was imported under). Omit for a new one. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  id?: string;

  /** What the team is asked; unique within the event. */
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  prompt: string;

  /** A draft can leave it empty; submitting needs an answer. Default false. */
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  /** Answers are shown in the public gallery. Default false: team, organisers and judges only. */
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

/** Every question, in the order teams see them. Replaces what is there. */
export class QuestionsInputDto {
  @IsArray()
  @ArrayMaxSize(MAX_QUESTIONS)
  @ValidateNested({ each: true })
  @Type(() => QuestionInputDto)
  questions: QuestionInputDto[];
}

export class QuestionDto {
  id: string;
  /** The id it was imported under, if any. */
  externalId: string | null;
  prompt: string;
  required: boolean;
  isPublic: boolean;
  order: number;
}

export class QuestionsDto {
  questions: QuestionDto[];
}
