import {ContactTrustLevel} from '@prisma/client';
import {IsEnum, IsString, Length} from 'class-validator';

export class CreateContactDto {
  @IsString()
  @Length(1, 255)
  identifier: string;

  @IsEnum(ContactTrustLevel)
  trustLevel: ContactTrustLevel;
}
