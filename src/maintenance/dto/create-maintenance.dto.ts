import { IsDateString, IsOptional, IsString } from 'class-validator';

// F-ROOM-05: 제보 연계 또는 직원 자체 등록(제보 없이도 가능, reportId 생략)
export class CreateMaintenanceDto {
  @IsString()
  roomId!: string;

  @IsString()
  reason!: string;

  @IsDateString()
  startAt!: string;

  @IsOptional()
  @IsString()
  reportId?: string;
}
