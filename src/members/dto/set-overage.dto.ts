import { IsInt, Min } from 'class-validator';

// F-MBR-02: 초과허용시간 셀프서비스 설정 (시간 단위)
export class SetOverageDto {
  @IsInt()
  @Min(0)
  overageAllowedHours!: number;
}
