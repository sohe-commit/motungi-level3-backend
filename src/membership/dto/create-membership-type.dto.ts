import { IsEnum, IsInt, IsString, Min } from 'class-validator';
import { MembershipTypeCode } from '@prisma/client';

export class CreateMembershipTypeDto {
  @IsEnum(MembershipTypeCode)
  code!: MembershipTypeCode; // FREE_SEAT / FIXED_SEAT / OFFICE — 공간 배정 검증에 쓰는 고정 코드

  @IsString()
  name!: string; // 자유석 / 고정석 / 오피스 (표시용 이름, 바뀔 수 있음)

  @IsInt()
  @Min(0)
  monthlyFee!: number;

  @IsInt()
  @Min(0)
  monthlyUsageHours!: number;
}
