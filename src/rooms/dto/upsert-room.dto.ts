import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

// F-ROOM-01: 회의실 등록/수정 (이름/정원/정기점검주기 + 보유 장비)
export class UpsertRoomDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maintenanceIntervalDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  floor?: number;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipmentTypeIds?: string[];
}
