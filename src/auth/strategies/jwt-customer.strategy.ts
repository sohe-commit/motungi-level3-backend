import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CustomerAccountStatus } from '@prisma/client';
import { CustomerJwtPayload } from '../jwt-payload.interface.js';

@Injectable()
export class JwtCustomerStrategy extends PassportStrategy(Strategy, 'jwt-customer') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: CustomerJwtPayload) {
    // kind 불일치는 조용히 실패(null)시켜야 AnyJwtGuard([jwt-customer, jwt-staff]) 같은 다중 전략에서
    // 다음 전략(jwt-staff)으로 넘어간다 — 여기서 던지면 체인 전체가 중단되어 버린다
    if (payload.kind !== 'customer') return null;

    const account = await this.prisma.customerAccount.findUnique({
      where: { id: payload.sub },
    });
    if (!account || account.status !== CustomerAccountStatus.ACTIVE) {
      // 비활성(퇴사) 계정은 로그인/접근 거부 — FR-AU10 계열 규칙을 고객계정에도 동일 적용
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    return {
      id: account.id,
      memberId: account.memberId,
      role: account.role,
      email: account.email,
      name: account.name,
    };
  }
}
