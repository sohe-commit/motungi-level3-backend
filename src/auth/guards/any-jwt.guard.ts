import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// 고객/직원 양쪽 다 접근해야 하는 조회 전용 엔드포인트에 사용 (예: 회의실 목록 — 고객은 예약 화면, 직원은 어드민 관리 화면)
@Injectable()
export class AnyJwtGuard extends AuthGuard(['jwt-customer', 'jwt-staff']) {}
