import { IsString } from 'class-validator';

export class CreateIssueReportDto {
  @IsString()
  roomId!: string;

  @IsString()
  content!: string;
}
