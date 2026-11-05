import { IsDateString, IsInt, IsString, Min } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  roomId!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsInt()
  @Min(1)
  attendeeCount!: number;
}
