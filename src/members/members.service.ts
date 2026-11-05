import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from '../billing/billing.service.js';
import { AddCompanyMemberDto } from './dto/add-company-member.dto.js';
import { SetOverageDto } from './dto/set-overage.dto.js';
import {
  CustomerAccountRole,
  CustomerAccountStatus,
  MemberStatus,
  MemberType,
  ReservationStatus,
} from '@prisma/client';

const SALT_ROUNDS = 10;

interface AuthedCustomer {
  id: string;
  memberId: string;
  role: CustomerAccountRole;
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // 소속 인원이면 누구나(일반사용자 포함) "소속 인원 관리" 화면에서 목록을 조회할 수 있다(관리 가능 여부는 각 액션에서 개별 확인)
  async listCompanyMembers(actor: AuthedCustomer) {
    await this.assertCompanyActor(actor);
    return this.prisma.customerAccount.findMany({
      where: { memberId: actor.memberId },
      select: { id: true, email: true, name: true, role: true, status: true, deactivatedAt: true },
      orderBy: { email: 'asc' },
    });
  }

  // F-AUTH-03: 최고관리자/권한관리자 둘 다 추가 가능 (신규 계정은 항상 일반사용자로 생성)
  async addCompanyMember(actor: AuthedCustomer, dto: AddCompanyMemberDto) {
    const member = await this.assertCompanyActor(actor);
    if (actor.role === CustomerAccountRole.MEMBER_USER) {
      throw new ForbiddenException('소속 인원 추가 권한이 없습니다.');
    }

    const existing = await this.prisma.customerAccount.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('이미 사용 중인 이메일입니다.');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    return this.prisma.customerAccount.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        memberId: member.id,
        role: CustomerAccountRole.MEMBER_USER,
      },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
  }

  // F-AUTH-04: 역할 변경 — 최고관리자/권한관리자 승격·강등은 최고관리자만 결정 가능
  async changeRole(actor: AuthedCustomer, targetAccountId: string, role: CustomerAccountRole) {
    await this.assertCompanyActor(actor);
    if (actor.role !== CustomerAccountRole.SUPER_ADMIN) {
      throw new ForbiddenException('역할 변경은 최고관리자만 할 수 있습니다.');
    }
    if (role === CustomerAccountRole.SUPER_ADMIN) {
      throw new BadRequestException('최고관리자 역할은 이 화면에서 지정할 수 없습니다.');
    }
    if (targetAccountId === actor.id) {
      throw new BadRequestException('본인의 역할은 이 화면에서 변경할 수 없습니다.');
    }
    const target = await this.getSameCompanyAccount(actor.memberId, targetAccountId);

    return this.prisma.customerAccount.update({
      where: { id: target.id },
      data: { role },
      select: { id: true, email: true, name: true, role: true, status: true },
    });
  }

  // F-AUTH-04: 퇴사 처리 — 최고관리자 본인은 대상이 될 수 없음(F-AUTH-05로 별도 처리)
  // 권한관리자는 일반사용자만 퇴사 처리할 수 있고, 다른 권한관리자·최고관리자는 건드릴 수 없다
  async deactivateMember(actor: AuthedCustomer, targetAccountId: string) {
    await this.assertCompanyActor(actor);
    if (actor.role === CustomerAccountRole.MEMBER_USER) {
      throw new ForbiddenException('퇴사 처리 권한이 없습니다.');
    }
    if (targetAccountId === actor.id) {
      throw new BadRequestException('최고관리자 본인은 이 경로로 퇴사 처리할 수 없습니다. 법인 탈퇴를 이용하세요.');
    }
    const target = await this.getSameCompanyAccount(actor.memberId, targetAccountId);
    this.assertCanManageTarget(actor.role, target.role);

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customerAccount.update({
        where: { id: target.id },
        data: { status: CustomerAccountStatus.INACTIVE, deactivatedAt: now },
      });

      // 향후 예약 자동 취소 (D.3)
      await tx.reservation.updateMany({
        where: { accountId: target.id, status: ReservationStatus.BOOKED, startAt: { gt: now } },
        data: { status: ReservationStatus.CANCELLED },
      });

      return updated;
    });
  }

  // F-AUTH-05: 법인 멤버십 탈퇴 (최고관리자 탈퇴 = 법인 전체 해지)
  // (선택) 규정: 해지 시 환불 금액도 함께 계산해 안내한다 (실제 결제 취소 트랜잭션은 범위 밖)
  async terminateCompany(actor: AuthedCustomer) {
    const member = await this.assertCompanySuperAdmin(actor);
    const now = new Date();

    const refund = await this.billing.calculateRefund(member.id).catch(() => null);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.member.update({ where: { id: member.id }, data: { status: MemberStatus.TERMINATED } });
      await tx.customerAccount.updateMany({
        where: { memberId: member.id },
        data: { status: CustomerAccountStatus.INACTIVE, deactivatedAt: now },
      });
      await tx.reservation.updateMany({
        where: { memberId: member.id, status: ReservationStatus.BOOKED, startAt: { gt: now } },
        data: { status: ReservationStatus.CANCELLED },
      });
      return { ok: true };
    });

    return { ...result, refund };
  }

  // 대시보드·상단 네비 등에서 "지금 로그인한 사람이 누구인지" 보여줄 때 쓰는 요약 정보
  async getMe(actor: AuthedCustomer) {
    const account = await this.prisma.customerAccount.findUniqueOrThrow({ where: { id: actor.id } });
    const member = await this.prisma.member.findUniqueOrThrow({ where: { id: actor.memberId } });
    return {
      name: account.name,
      email: account.email,
      type: member.type,
      companyName: member.companyName,
      role: actor.role,
      status: member.status,
    };
  }

  // F-RSV-04: 같은 법인 소속 인원 예약 상세 조회 (읽기 전용)
  async listTeamReservations(actor: AuthedCustomer) {
    return this.prisma.reservation.findMany({
      where: { memberId: actor.memberId },
      include: { room: { select: { id: true, name: true } }, account: { select: { id: true, name: true } } },
      orderBy: { startAt: 'desc' },
    });
  }

  // F-MBR-02: 초과허용시간 셀프서비스 설정 (개인 본인 / 법인 최고관리자)
  async setOverage(actor: AuthedCustomer, dto: SetOverageDto) {
    const member = await this.prisma.member.findUniqueOrThrow({ where: { id: actor.memberId } });
    if (member.type === MemberType.COMPANY && actor.role !== CustomerAccountRole.SUPER_ADMIN) {
      throw new ForbiddenException('법인의 초과허용시간은 최고관리자만 설정할 수 있습니다.');
    }
    return this.prisma.member.update({
      where: { id: member.id },
      data: { overageAllowedHours: dto.overageAllowedHours },
      select: { id: true, overageAllowedHours: true },
    });
  }

  private async assertCompanySuperAdmin(actor: AuthedCustomer) {
    const member = await this.assertCompanyActor(actor);
    if (actor.role !== CustomerAccountRole.SUPER_ADMIN) {
      throw new ForbiddenException('최고관리자만 사용할 수 있는 기능입니다.');
    }
    return member;
  }

  private async assertCompanyActor(actor: AuthedCustomer) {
    const member = await this.prisma.member.findUniqueOrThrow({ where: { id: actor.memberId } });
    if (member.type !== MemberType.COMPANY) {
      throw new ForbiddenException('법인 멤버만 사용할 수 있는 기능입니다.');
    }
    return member;
  }

  // 대표(최고관리자): 전체 대상. 권한관리자: 일반사용자만 대상 가능. (직원 쪽 assertCanManage와 동일한 패턴)
  private assertCanManageTarget(actorRole: CustomerAccountRole, targetRole: CustomerAccountRole) {
    if (actorRole === CustomerAccountRole.SUPER_ADMIN) return;
    if (actorRole === CustomerAccountRole.PERMISSION_ADMIN && targetRole === CustomerAccountRole.MEMBER_USER) {
      return;
    }
    throw new ForbiddenException('해당 소속 인원을 관리할 권한이 없습니다.');
  }

  private async getSameCompanyAccount(memberId: string, accountId: string) {
    const account = await this.prisma.customerAccount.findUnique({ where: { id: accountId } });
    if (!account || account.memberId !== memberId) {
      throw new NotFoundException('같은 법인 소속 계정만 관리할 수 있습니다.');
    }
    return account;
  }
}
