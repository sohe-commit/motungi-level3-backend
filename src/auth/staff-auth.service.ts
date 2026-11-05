import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { StaffPosition, StaffStatus } from '@prisma/client';
import { StaffJwtPayload } from './jwt-payload.interface.js';

const SALT_ROUNDS = 10;

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // 직원 계정은 회원가입이 없다 — 로그인만 존재 (FR-AU8)
  async login(dto: LoginDto) {
    const staff = await this.prisma.staff.findUnique({ where: { email: dto.email } });
    if (!staff) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');

    const ok = await bcrypt.compare(dto.password, staff.passwordHash);
    if (!ok) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');

    if (staff.status !== StaffStatus.ACTIVE) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    const payload: StaffJwtPayload = { sub: staff.id, kind: 'staff', position: staff.position };
    return {
      accessToken: this.jwt.sign(payload),
      mustChangePassword: staff.mustChangePassword, // FR-AU11: 리셋 직후면 true
    };
  }

  // 리셋된 비밀번호를 다음 로그인 시 강제로 바꾸는 흐름 (FR-AU11)
  async changePassword(staffId: string, dto: ChangePasswordDto) {
    const staff = await this.prisma.staff.findUniqueOrThrow({ where: { id: staffId } });

    const ok = await bcrypt.compare(dto.currentPassword, staff.passwordHash);
    if (!ok) throw new UnauthorizedException('현재 비밀번호가 올바르지 않습니다.');

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.prisma.staff.update({
      where: { id: staffId },
      data: { passwordHash, mustChangePassword: false },
    });
    return { ok: true };
  }
}
