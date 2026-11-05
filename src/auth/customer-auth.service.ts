import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { CustomerAccountRole, CustomerAccountStatus, MemberStatus, MemberType } from '@prisma/client';
import { CustomerJwtPayload } from './jwt-payload.interface.js';

const SALT_ROUNDS = 10;

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // F-AUTH-01: 개인/법인 공통 셀프서비스 회원가입
  // 법인 선택 시 가입자가 자동으로 그 법인의 최고관리자가 된다.
  async signup(dto: SignupDto) {
    const existing = await this.prisma.customerAccount.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException('이미 사용 중인 이메일입니다.');
    }

    if (dto.memberType === MemberType.COMPANY && !dto.companyName) {
      throw new BadRequestException('법인명을 입력해주세요.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const account = await this.prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          type: dto.memberType,
          companyName: dto.memberType === MemberType.COMPANY ? dto.companyName : null,
          status: MemberStatus.ACTIVE,
        },
      });

      return tx.customerAccount.create({
        data: {
          email: dto.email,
          passwordHash,
          name: dto.name,
          memberId: member.id,
          // 법인 가입자는 자동으로 최고관리자, 개인은 역할 구분 의미 없음(기본값)
          role:
            dto.memberType === MemberType.COMPANY
              ? CustomerAccountRole.SUPER_ADMIN
              : CustomerAccountRole.MEMBER_USER,
        },
      });
    });

    return this.issueToken(account.id, account.memberId, account.role);
  }

  // F-AUTH-02
  async login(dto: LoginDto) {
    const account = await this.prisma.customerAccount.findUnique({
      where: { email: dto.email },
    });
    if (!account) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');

    const ok = await bcrypt.compare(dto.password, account.passwordHash);
    if (!ok) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');

    if (account.status !== CustomerAccountStatus.ACTIVE) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    return this.issueToken(account.id, account.memberId, account.role);
  }

  private issueToken(sub: string, memberId: string, role: CustomerAccountRole) {
    const payload: CustomerJwtPayload = { sub, kind: 'customer', memberId, role };
    return { accessToken: this.jwt.sign(payload) };
  }
}
