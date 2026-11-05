import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReservationStatus } from '@prisma/client';

const OVERAGE_RATE_PER_HOUR = 15000; // 원 — 시간당 초과 요금 (D.4)

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  // 오늘을 기준으로 멤버의 "현재 결제 주기" 멤버십이력을 찾는다.
  // FR-A3/FR-MBR-01: 결제 주기 = 멤버십이력.시작일 ~ 종료일
  async getActiveMembershipHistory(memberId: string, asOf: Date = new Date()) {
    const history = await this.prisma.membershipHistory.findFirst({
      where: { memberId, startDate: { lte: asOf }, endDate: { gt: asOf } },
      include: { membershipType: true },
      orderBy: { startDate: 'desc' },
    });
    if (!history) {
      throw new BadRequestException('현재 유효한 멤버십이 없습니다.');
    }
    return history;
  }

  // 이번 결제 주기(멤버십이력 기간) 동안 실제 사용한 시간의 합
  // 예약됨 상태 + "시작 1시간 전 이후 취소"(노쇼와 같은 논리로 이용한 것으로 간주, FR-B8)도 포함
  async getUsedHoursInCycle(memberId: string, cycleStart: Date, cycleEnd: Date) {
    const reservations = await this.prisma.reservation.findMany({
      where: {
        memberId,
        startAt: { gte: cycleStart, lt: cycleEnd },
        OR: [{ status: ReservationStatus.BOOKED }, { noRefundCancel: true }],
      },
      select: { startAt: true, endAt: true },
    });

    const usedMs = reservations.reduce(
      (sum, r) => sum + (r.endAt.getTime() - r.startAt.getTime()),
      0,
    );
    return usedMs / (1000 * 60 * 60); // hours
  }

  // F-MBR-04: 멤버별 잔여 이용시간 (멤버십 결제 주기 기준)
  async getQuotaSummary(memberId: string) {
    const member = await this.prisma.member.findUniqueOrThrow({ where: { id: memberId } });
    const history = await this.getActiveMembershipHistory(memberId);
    const usedHours = await this.getUsedHoursInCycle(memberId, history.startDate, history.endDate);

    const baseLimitHours = history.membershipType.monthlyUsageHours;
    const totalAllowedHours = baseLimitHours + member.overageAllowedHours;
    const remainingHours = Math.max(0, totalAllowedHours - usedHours);
    const overageUsedHours = Math.max(0, usedHours - baseLimitHours);

    return {
      membershipType: history.membershipType.name,
      cycleStart: history.startDate,
      cycleEnd: history.endDate,
      baseLimitHours,
      overageAllowedHours: member.overageAllowedHours,
      totalAllowedHours,
      usedHours,
      overageUsedHours,
      remainingHours,
    };
  }

  // F-MBR-05: 이번 결제 주기 청구 금액 = 멤버십 요금 + 초과시간 × 15,000원
  async getMonthlyCharge(memberId: string) {
    const history = await this.getActiveMembershipHistory(memberId);
    const usedHours = await this.getUsedHoursInCycle(memberId, history.startDate, history.endDate);
    const overageHours = Math.max(0, usedHours - history.membershipType.monthlyUsageHours);
    const overageCharge = Math.round(overageHours * OVERAGE_RATE_PER_HOUR);

    return {
      membershipFee: history.membershipType.monthlyFee,
      overageHours,
      overageCharge,
      totalCharge: history.membershipType.monthlyFee + overageCharge,
      cycleStart: history.startDate,
      cycleEnd: history.endDate,
    };
  }

  // (선택) 규정: 멤버십 환불 — 이용 7일 이내 전액, 이후 남은 일수 일할 계산 + 수수료 10%
  // 실제 결제 취소/송금 트랜잭션은 범위 밖 — 해지 시점에 환불 금액만 계산해 안내한다
  async calculateRefund(memberId: string) {
    const history = await this.getActiveMembershipHistory(memberId);
    const { monthlyFee } = history.membershipType;
    const now = new Date();

    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const daysUsed = (now.getTime() - history.startDate.getTime()) / MS_PER_DAY;
    const totalCycleDays = (history.endDate.getTime() - history.startDate.getTime()) / MS_PER_DAY;
    const remainingDays = Math.max(0, (history.endDate.getTime() - now.getTime()) / MS_PER_DAY);

    if (daysUsed <= 7) {
      return {
        cycleStart: history.startDate,
        cycleEnd: history.endDate,
        daysUsed,
        refundType: 'FULL' as const,
        refundAmount: monthlyFee,
      };
    }

    const proRated = monthlyFee * (remainingDays / totalCycleDays);
    const refundAmount = Math.round(proRated * 0.9); // 수수료 10% 차감

    return {
      cycleStart: history.startDate,
      cycleEnd: history.endDate,
      daysUsed,
      refundType: 'PRORATED' as const,
      refundAmount,
    };
  }

  // 예약 가능 시간 체크에 쓰는 헬퍼 — F-RSV-01 6단계
  async canReserveHours(memberId: string, requestedHours: number) {
    const summary = await this.getQuotaSummary(memberId);
    return requestedHours <= summary.remainingHours;
  }

  // 어드민: 멤버별 이번 달 청구 금액 전체 목록
  async listAllMonthlyCharges() {
    const members = await this.prisma.member.findMany({ where: { status: 'ACTIVE' } });
    const result = [] as Array<{ memberId: string; companyName: string | null } & Awaited<
      ReturnType<BillingService['getMonthlyCharge']>
    >>;

    for (const member of members) {
      try {
        const charge = await this.getMonthlyCharge(member.id);
        result.push({ memberId: member.id, companyName: member.companyName, ...charge });
      } catch {
        // 유효한 멤버십이력이 없는 멤버는 건너뜀
      }
    }
    return result;
  }

  // D.5: 법인 소속 인원별 이번 달 이용시간
  async getCompanyUsageBreakdown(memberId: string) {
    const history = await this.getActiveMembershipHistory(memberId);
    const reservations = await this.prisma.reservation.findMany({
      where: {
        memberId,
        status: ReservationStatus.BOOKED,
        startAt: { gte: history.startDate, lt: history.endDate },
      },
      include: { account: { select: { id: true, name: true } } },
    });

    const byAccount = new Map<string, { accountName: string; hours: number }>();
    for (const r of reservations) {
      const hours = (r.endAt.getTime() - r.startAt.getTime()) / (1000 * 60 * 60);
      const entry = byAccount.get(r.accountId) ?? { accountName: r.account.name, hours: 0 };
      entry.hours += hours;
      byAccount.set(r.accountId, entry);
    }

    return Array.from(byAccount.entries()).map(([accountId, v]) => ({ accountId, ...v }));
  }
}
