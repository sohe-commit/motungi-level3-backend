import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateMembershipTypeDto } from './dto/create-membership-type.dto.js';
import { StartMembershipDto } from './dto/start-membership.dto.js';
import { CustomerAccountRole, MemberType, MembershipTypeCode, SpaceType } from '@prisma/client';

// 공간 유형별로 반드시 보유하고 있어야 하는 멤버십종류 코드
const REQUIRED_CODE_BY_SPACE_TYPE: Record<SpaceType, MembershipTypeCode> = {
  SEAT: MembershipTypeCode.FIXED_SEAT, // 고정석 공간은 고정석 멤버십만
  OFFICE: MembershipTypeCode.OFFICE, // 오피스 공간은 오피스 멤버십만
};

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  // --- 멤버십종류 (마스터 데이터) ---
  createMembershipType(dto: CreateMembershipTypeDto) {
    return this.prisma.membershipType.create({ data: dto });
  }

  listMembershipTypes() {
    return this.prisma.membershipType.findMany({ orderBy: { monthlyFee: 'asc' } });
  }

  // --- 멤버십이력 ---

  // 최초 가입 시 멤버십 등록 (해당 멤버에게 유효한 이력이 아직 없을 때)
  async startMembership(memberId: string, dto: StartMembershipDto) {
    const overlapping = await this.prisma.membershipHistory.findFirst({
      where: {
        memberId,
        startDate: { lt: new Date(dto.endDate) },
        endDate: { gt: new Date(dto.startDate) },
      },
    });
    if (overlapping) {
      throw new BadRequestException('해당 기간에 이미 멤버십 이력이 존재합니다.');
    }

    return this.prisma.membershipHistory.create({
      data: {
        memberId,
        membershipTypeId: dto.membershipTypeId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
    });
  }

  // F-MBR-01: 멤버십 종류 변경
  // 업그레이드(한도 ↑) = 현재 이력 레코드를 즉시 바꿔치기, 이미 쓴 시간은 그대로 유지
  // 다운그레이드(한도 ↓) = 다음 주기(현재 이력 종료일부터)로 새 이력 생성, 현재 주기는 그대로 유지
  async changeMembership(memberId: string, newTypeId: string) {
    const now = new Date();
    const current = await this.prisma.membershipHistory.findFirst({
      where: { memberId, startDate: { lte: now }, endDate: { gt: now } },
      include: { membershipType: true },
      orderBy: { startDate: 'desc' },
    });
    if (!current) throw new NotFoundException('현재 유효한 멤버십이 없습니다.');

    const newType = await this.prisma.membershipType.findUniqueOrThrow({ where: { id: newTypeId } });
    const isUpgrade = newType.monthlyUsageHours >= current.membershipType.monthlyUsageHours;

    if (isUpgrade) {
      return this.prisma.membershipHistory.update({
        where: { id: current.id },
        data: { membershipTypeId: newTypeId },
      });
    }

    // 다운그레이드: 같은 주기 길이로 다음 이력을 미리 생성해둔다 (다음 주기부터 적용)
    const cycleLengthMs = current.endDate.getTime() - current.startDate.getTime();
    const nextStart = current.endDate;
    const nextEnd = new Date(current.endDate.getTime() + cycleLengthMs);

    return this.prisma.membershipHistory.create({
      data: { memberId, membershipTypeId: newTypeId, startDate: nextStart, endDate: nextEnd },
    });
  }

  // 고객 셀프서비스: 첫 멤버십 구독 (현재 유효한 멤버십이 없을 때만 가능)
  async subscribe(memberId: string, membershipTypeId: string) {
    const now = new Date();
    const existing = await this.prisma.membershipHistory.findFirst({
      where: { memberId, startDate: { lte: now }, endDate: { gt: now } },
    });
    if (existing) {
      throw new BadRequestException('이미 구독 중인 멤버십이 있습니다. 멤버십 변경을 이용해주세요.');
    }

    const startDate = now;
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);

    return this.prisma.membershipHistory.create({
      data: { memberId, membershipTypeId, startDate, endDate },
      include: { membershipType: true },
    });
  }

  // 어드민: 멤버 목록 + 현재 멤버십 요약
  async listMembers() {
    const now = new Date();
    return this.prisma.member.findMany({
      include: {
        accounts: { select: { id: true, email: true, name: true, role: true, status: true } },
        membershipHistories: {
          where: { startDate: { lte: now }, endDate: { gt: now } },
          include: { membershipType: true },
          take: 1,
        },
        spaceAssignments: {
          where: { startDate: { lte: now }, endDate: { gt: now } },
          select: { spaceType: true, spaceNumber: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // F-MBR-06 / C.3: 이번 달(캘린더 월) 멤버십 종료 예정 멤버 목록
  async getExpiringMembers(yearMonth?: string) {
    const now = new Date();
    const year = yearMonth ? Number(yearMonth.split('-')[0]) : now.getFullYear();
    const month = yearMonth ? Number(yearMonth.split('-')[1]) - 1 : now.getMonth();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 1);

    return this.prisma.membershipHistory.findMany({
      where: { endDate: { gte: monthStart, lt: monthEnd } },
      include: { member: true, membershipType: true },
      orderBy: { endDate: 'asc' },
    });
  }

  // --- 전용공간배정 (일반석 구역의 고정석 SEAT / 오피스 구역의 호실 OFFICE) ---
  // 자유석은 "고정석이 아닌 나머지 일반석을 오픈으로 쓰는" 개념이라 배정 레코드가 없다.
  // 공간 유형과 멤버의 현재 멤버십이 일치하는지 확인 — 오피스 공간은 오피스 멤버십이 아니면 배정 자체가 불가
  private async assertMembershipMatchesSpaceType(memberId: string, spaceType: SpaceType) {
    const requiredCode = REQUIRED_CODE_BY_SPACE_TYPE[spaceType];
    const now = new Date();
    const currentMembership = await this.prisma.membershipHistory.findFirst({
      where: { memberId, startDate: { lte: now }, endDate: { gt: now } },
      include: { membershipType: true },
      orderBy: { startDate: 'desc' },
    });
    if (!currentMembership || currentMembership.membershipType.code !== requiredCode) {
      const spaceLabel = spaceType === 'SEAT' ? '고정석' : '오피스';
      throw new BadRequestException(`${spaceLabel} 멤버십을 보유한 멤버에게만 ${spaceLabel} 공간을 배정할 수 있습니다.`);
    }
    return currentMembership;
  }

  private async createSpaceAssignment(
    memberId: string,
    spaceType: SpaceType,
    spaceNumber: string,
    startDate: Date,
    endDate: Date,
  ) {
    const overlapping = await this.prisma.spaceAssignment.findFirst({
      where: { spaceType, spaceNumber, startDate: { lt: endDate }, endDate: { gt: startDate } },
    });
    if (overlapping) {
      throw new BadRequestException('해당 기간에 이미 배정된 공간입니다.');
    }
    return this.prisma.spaceAssignment.create({
      data: { memberId, spaceType, spaceNumber, startDate, endDate },
    });
  }

  // 어드민: 임의 기간으로 직접 배정(예외 처리용 — 기본 경로는 고객 셀프서비스 selfAssignSpace)
  async assignSpace(
    memberId: string,
    spaceType: SpaceType,
    spaceNumber: string,
    startDate: string,
    endDate: string,
  ) {
    await this.assertMembershipMatchesSpaceType(memberId, spaceType);
    return this.createSpaceAssignment(memberId, spaceType, spaceNumber, new Date(startDate), new Date(endDate));
  }

  listSpaceAssignments() {
    return this.prisma.spaceAssignment.findMany({
      include: { member: { select: { id: true, type: true, companyName: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  // 어드민 대시보드: 전체 공간 현황 요약 — 자유석은 좌석 수 자체가 없는 개념이라 활성 멤버 수로 대신 보여준다
  async getSpaceSummary() {
    const now = new Date();
    const activeFilter = { startDate: { lte: now }, endDate: { gt: now } };

    const [seatTotal, officeTotal, seatOccupied, officeOccupied, freeSeatActiveMembers] =
      await Promise.all([
        this.prisma.buildingSpace.count({ where: { spaceType: SpaceType.SEAT } }),
        this.prisma.buildingSpace.count({ where: { spaceType: SpaceType.OFFICE } }),
        this.prisma.spaceAssignment.count({ where: { spaceType: SpaceType.SEAT, ...activeFilter } }),
        this.prisma.spaceAssignment.count({ where: { spaceType: SpaceType.OFFICE, ...activeFilter } }),
        this.prisma.membershipHistory.count({
          where: { ...activeFilter, membershipType: { code: MembershipTypeCode.FREE_SEAT } },
        }),
      ]);

    return {
      seat: { total: seatTotal, occupied: seatOccupied },
      office: { total: officeTotal, occupied: officeOccupied },
      freeSeatActiveMembers,
    };
  }

  // 고객 셀프서비스: 지금 배정돼있는 내 전용 공간 (고정석 또는 오피스, 없으면 null)
  async getMySpace(memberId: string) {
    const now = new Date();
    return this.prisma.spaceAssignment.findFirst({
      where: { memberId, startDate: { lte: now }, endDate: { gt: now } },
    });
  }

  // 고객 셀프서비스: 가상의 건물 구조도 — 내 멤버십과 맞는 공간 유형의 전체 자리/호실을 현재 사용 가능 여부와 함께 보여준다
  async listAvailableSpaces(spaceType: SpaceType) {
    const now = new Date();
    const [spaces, occupied] = await Promise.all([
      this.prisma.buildingSpace.findMany({ where: { spaceType }, orderBy: { spaceNumber: 'asc' } }),
      this.prisma.spaceAssignment.findMany({
        where: { spaceType, startDate: { lte: now }, endDate: { gt: now } },
        select: { spaceNumber: true },
      }),
    ]);
    const occupiedNumbers = new Set(occupied.map((o) => o.spaceNumber));
    return spaces.map((s) => ({ ...s, available: !occupiedNumbers.has(s.spaceNumber) }));
  }

  // 고객 셀프서비스: 건물 구조도에서 비어있는 자리를 직접 선택해 배정받는다 (기간 = 현재 멤버십 결제 주기)
  // 법인은 공용 공간이므로 최고관리자/권한관리자만 선택 가능 — 일반사용자는 제외
  async selfAssignSpace(actor: { memberId: string; role: CustomerAccountRole }, spaceNumber: string) {
    const member = await this.prisma.member.findUniqueOrThrow({ where: { id: actor.memberId } });
    if (member.type === MemberType.COMPANY && actor.role === CustomerAccountRole.MEMBER_USER) {
      throw new ForbiddenException('공간 선택은 최고관리자·권한관리자만 할 수 있습니다.');
    }

    const existingSpace = await this.getMySpace(actor.memberId);
    if (existingSpace) {
      throw new BadRequestException('이미 배정된 공간이 있습니다. 변경은 모퉁이 운영진에게 문의해주세요.');
    }

    const space = await this.prisma.buildingSpace.findUnique({ where: { spaceNumber } });
    if (!space) throw new NotFoundException('존재하지 않는 자리/호실입니다.');

    const currentMembership = await this.assertMembershipMatchesSpaceType(actor.memberId, space.spaceType);
    return this.createSpaceAssignment(
      actor.memberId,
      space.spaceType,
      space.spaceNumber,
      currentMembership.startDate,
      currentMembership.endDate,
    );
  }
}
