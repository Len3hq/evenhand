import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const normaliseEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class LoginDto {
  @Transform(normaliseEmail)
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(200)
  password: string;
}

export class RegisterDto {
  @Transform(normaliseEmail)
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  /** At least 10 characters. */
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  password: string;
}

export class RoleDto {
  eventId: string;
  role: 'PARTICIPANT' | 'JUDGE' | 'ORGANIZER';
  /** Fixture id for imported judges, e.g. jdg_24. */
  externalId: string | null;
}

export class MeDto {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  roles: RoleDto[];
}
