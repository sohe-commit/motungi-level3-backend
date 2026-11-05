import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { StaffPosition } from '@prisma/client';

export class CreateStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsEnum(StaffPosition)
  position!: StaffPosition;

  @IsOptional()
  @IsString()
  team?: string;
}
