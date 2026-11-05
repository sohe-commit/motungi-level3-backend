import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from '../billing/billing.service.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { MaintenanceStatus, MemberStatus, ReservationStatus } from '@prisma/client';
import { ROOM_OPEN_HOUR, ROOM_CLOSE_HOUR, SLOT_MINUTES } from '../common/constants.js';

const CANCEL_CUTOFF_MS = 60 * 60 * 1000; // 시작 1시간 전 — (선택) 규정: 그 뒤 취소는 이용한 것으로 봄(쿼터 미환원)

interface AuthedCustomer {
  id: string;
  memberId: string;
}

@Injectable()
export class ReservationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  // F-RSV-01: 7단계 검증 순서를 그대로 구현
  async create(actor: AuthedCustomer, dto: CreateReservationDto) {
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    // 1. 운영시간(08:00~22:00) + 30분 단위
    this.assertWithinOperatingHours(startAt, endAt);

    // 2. 종료 > 시작
    if (endAt <= startAt) {
      throw new BadRequestException('종료 시각은 시작 시각보다 늦어야 합니다.');
    }

    // 지난 날짜/시각은 예약할 수 없다
    if (startAt.getTime() < Date.now()) {
      throw new BadRequestException('지난 날짜/시각은 예약할 수 없습니다.');
    }

    const room = await this.prisma.meetingRoom.findUnique({ where: { id: dto.roomId } });
    if (!room) throw new NotFoundException('회의실을 찾을 수 없습니다.');

    // 3. 같은 회의실·시간대 중복 예약 여부 (전역, 법인 무관)
    const overlapping = await this.prisma.reservation.findFirst({
      where: {
        roomId: dto.roomId,
        status: ReservationStatus.BOOKED,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });
    if (overlapping) {
      throw new BadRequestException('이미 예약된 시간대입니다.');
    }

    // 4. 점검 일정과 겹치는지 확인
    const maintenanceConflict = await this.prisma.roomMaintenance.findFirst({
      where: {
        roomId: dto.roomId,
        status: MaintenanceStatus.IN_PROGRESS,
        startAt: { lt: endAt },
        OR: [{ endAt: null }, { endAt: { gt: startAt } }],
      },
    });
    if (maintenanceConflict) {
      throw new BadRequestException('점검 중인 회의실은 예약할 수 없습니다.');
    }

    // 5. 참석 인원 <= 정원
    if (dto.attendeeCount > room.capacity) {
      throw new BadRequestException(`참석 인원이 회의실 정원(${room.capacity}명)을 초과합니다.`);
    }

    // 6. 멤버의 결제 주기 잔여시간 확인 (멤버십 유효성도 내부에서 함께 확인됨 — 7단계)
    const requestedHours = (endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60);
    const canReserve = await this.billing.canReserveHours(actor.memberId, requestedHours);
    if (!canReserve) {
      throw new BadRequestException('이번 결제 주기의 잔여 이용시간을 초과합니다.');
    }

    // 7. 멤버십 유효기간(해지 여부) 확인
    const member = await this.prisma.member.findUniqueOrThrow({ where: { id: actor.memberId } });
    if (member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException('멤버십이 종료된 멤버는 예약할 수 없습니다.');
    }

    return this.prisma.reservation.create({
      data: {
        roomId: dto.roomId,
        accountId: actor.id,
        memberId: actor.memberId,
        startAt,
        endAt,
        attendeeCount: dto.attendeeCount,
        status: ReservationStatus.BOOKED,
      },
      include: { room: { select: { id: true, name: true } } },
    });
  }

  // F-RSV-02: 본인 예약만 취소 가능
  // (선택) 규정: 시작 1시간 전 이후 취소는 "이용한 것"으로 간주 — 쿼터를 환원하지 않는다
  async cancel(actor: AuthedCustomer, reservationId: string) {
    const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) throw new NotFoundException('예약을 찾을 수 없습니다.');
    if (reservation.accountId !== actor.id) {
      throw new ForbiddenException('본인이 생성한 예약만 취소할 수 있습니다.');
    }
    const isLateCancel = reservation.startAt.getTime() - Date.now() < CANCEL_CUTOFF_MS;
    return this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.CANCELLED, noRefundCancel: isLateCancel },
    });
  }

  // F-RSV-03: 내 예약 목록 (지난/다가올/사용중 구분은 조회 시점 계산값 — FR-B6)
  async listMine(actor: AuthedCustomer) {
    const reservations = await this.prisma.reservation.findMany({
      where: { accountId: actor.id },
      include: { room: { select: { id: true, name: true } } },
      orderBy: { startAt: 'desc' },
    });

    const now = new Date();
    return reservations.map((r) => ({
      ...r,
      timeline:
        r.status === ReservationStatus.CANCELLED
          ? 'cancelled'
          : now < r.startAt
            ? 'upcoming'
            : now <= r.endAt
              ? 'ongoing'
              : 'past',
    }));
  }

  // F-RSV-06: 어드민 — 전체 예약 조회 + 상태 변경
  async listAllForAdmin() {
    return this.prisma.reservation.findMany({
      include: {
        room: { select: { id: true, name: true } },
        account: { select: { id: true, name: true, email: true } },
        member: { select: { id: true, companyName: true, type: true } },
      },
      orderBy: { startAt: 'desc' },
    });
  }

  async updateStatusAsAdmin(reservationId: string, status: ReservationStatus) {
    return this.prisma.reservation.update({ where: { id: reservationId }, data: { status } });
  }

  private assertWithinOperatingHours(startAt: Date, endAt: Date) {
    const checkTime = (d: Date) => {
      const hour = d.getHours();
      const minute = d.getMinutes();
      if (minute % SLOT_MINUTES !== 0) {
        throw new BadRequestException('예약은 30분 단위로만 가능합니다.');
      }
      const totalMinutes = hour * 60 + minute;
      if (totalMinutes < ROOM_OPEN_HOUR * 60 || totalMinutes > ROOM_CLOSE_HOUR * 60) {
        throw new BadRequestException('예약은 08:00~22:00 안에서만 가능합니다.');
      }
    };
    checkTime(startAt);
    checkTime(endAt);
  }
}
