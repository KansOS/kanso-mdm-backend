import {ContactTrustLevel} from '@prisma/client';
import {IsEnum, IsString, Length, ValidateIf} from 'class-validator';

export class UpdateContactDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Length(1, 255)
  identifier?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ContactTrustLevel)
  trustLevel?: ContactTrustLevel;
}
