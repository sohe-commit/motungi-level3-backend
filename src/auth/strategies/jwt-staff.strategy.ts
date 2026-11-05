import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StaffStatus } from '@prisma/client';
import { StaffJwtPayload } from '../jwt-payload.interface.js';

@Injectable()
export class JwtStaffStrategy extends PassportStrategy(Strategy, 'jwt-staff') {
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

  async validate(payload: StaffJwtPayload) {
    // kind 불일치는 조용히 실패(null)시켜야 AnyJwtGuard([jwt-customer, jwt-staff]) 같은 다중 전략에서
    // 다음 전략으로 넘어간다 — 여기서 던지면 체인 전체가 중단되어 버린다
    if (payload.kind !== 'staff') return null;

    const staff = await this.prisma.staff.findUnique({ where: { id: payload.sub } });
    if (!staff || staff.status !== StaffStatus.ACTIVE) {
      // 정지된 직원 계정은 로그인할 수 없다 — FR-AU10
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    return {
      id: staff.id,
      position: staff.position,
      team: staff.team,
      email: staff.email,
      name: staff.name,
      mustChangePassword: staff.mustChangePassword,
    };
  }
}
