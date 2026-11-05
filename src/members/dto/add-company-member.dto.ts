import { IsEmail, IsString, MinLength } from 'class-validator';

// F-AUTH-03: 법인 최고관리자가 소속 인원 계정을 추가한다 (모퉁이 운영진 승인 불필요)
export class AddCompanyMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  name!: string;
}
