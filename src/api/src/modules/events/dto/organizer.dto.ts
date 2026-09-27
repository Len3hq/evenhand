import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';

export class AddOrganizerDto {
  /** An existing account's email: the portal sends no email, so they register first. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;
}

export class OrganizerDto {
  userId: string;
  name: string;
  email: string;
  /** When they became an organiser of this event. */
  since: string;
}
