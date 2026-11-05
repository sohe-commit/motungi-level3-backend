import { IsDateString, IsString } from 'class-validator';

// 최초 가입 또는 멤버십 변경/연장 등록 — F-MBR-01
export class StartMembershipDto {
  @IsString()
  membershipTypeId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;
}
