import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// FR-AU3: 비로그인 사용자는 신청 화면에 접근할 수 없다
@Injectable()
export class CustomerJwtGuard extends AuthGuard('jwt-customer') {}
