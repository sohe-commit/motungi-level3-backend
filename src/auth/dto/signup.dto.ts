import { IsEmail, IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { MemberType } from '@prisma/client';

export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;

  @IsEnum(MemberType)
  memberType!: MemberType; // INDIVIDUAL | COMPANY

  @ValidateIf((o) => o.memberType === MemberType.COMPANY)
  @IsString()
  companyName?: string;
}
