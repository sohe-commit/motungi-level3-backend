import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpsertRoomDto } from './dto/upsert-room.dto.js';
import { MaintenanceStatus, ReportStatus, ReservationStatus } from '@prisma/client';
import { DAILY_OPEN_HOURS, ROOM_OPEN_HOUR, ROOM_CLOSE_HOUR, SLOT_MINUTES } from '../common/constants.js';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  // 신규: 아직 처리되지 않은(접수/처리중) 제보를 회의실별로 묶어, 예약 화면에 "현재 알려진 문제"로 노출한다
  private async attachActiveIssues<T extends { id: string }>(rooms: T[]) {
    const roomIds = rooms.map((r) => r.id);
    const openReports = await this.prisma.issueReport.findMany({
      where: { roomId: { in: roomIds }, status: { not: ReportStatus.COMPLETED } },
      select: { id: true, roomId: true, content: true },
      orderBy: { reportedAt: 'desc' },
    });
    const byRoom = new Map<string, { id: string; content: string }[]>();
    for (const r of openReports) {
      const list = byRoom.get(r.roomId) ?? [];
      list.push({ id: r.id, content: r.content });
      byRoom.set(r.roomId, list);
    }
    return rooms.map((r) => ({ ...r, activeIssues: byRoom.get(r.id) ?? [] }));
  }

  // 신규: 지금 이 순간 점검중(IN_PROGRESS)인 회의실인지 — 어드민 "예약 가능 여부" 표시용
  private async attachMaintenanceStatus<T extends { id: string }>(rooms: T[]) {
    const roomIds = rooms.map((r) => r.id);
    const now = new Date();
    const ongoing = await this.prisma.roomMaintenance.findMany({
      where: {
        roomId: { in: roomIds },
        status: MaintenanceStatus.IN_PROGRESS,
        startAt: { lte: now },
        OR: [{ endAt: null }, { endAt: { gt: now } }],
      },
      select: { roomId: true },
    });
    const underMaintenance = new Set(ongoing.map((m) => m.roomId));
    return rooms.map((r) => ({ ...r, currentlyUnderMaintenance: underMaintenance.has(r.id) }));
  }

  // F-RSV-05: 장비 필터 검색 (equipmentTypeId 생략 시 전체 목록)
  async listRooms(equipmentTypeId?: string) {
    const rooms = await this.prisma.meetingRoom.findMany({
      where: equipmentTypeId
        ? { equipmentLinks: { some: { equipmentTypeId } } }
        : undefined,
      include: { equipmentLinks: { include: { equipmentType: true } } },
      orderBy: { name: 'asc' },
    });
    return this.attachMaintenanceStatus(await this.attachActiveIssues(rooms));
  }

  // F-RSV-01 UX 개선: 원하는 조건(날짜/시간/인원/장비)을 먼저 받아 그 조건에 맞고 비어있는 회의실만 보여준다
  async findAvailableRooms(startAt: Date, endAt: Date, attendeeCount?: number, equipmentTypeId?: string) {
    const rooms = await this.prisma.meetingRoom.findMany({
      where: {
        capacity: attendeeCount ? { gte: attendeeCount } : undefined,
        equipmentLinks: equipmentTypeId ? { some: { equipmentTypeId } } : undefined,
      },
      include: { equipmentLinks: { include: { equipmentType: true } } },
      orderBy: { name: 'asc' },
    });
    const roomIds = rooms.map((r) => r.id);

    const [busyReservations, busyMaintenances] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          roomId: { in: roomIds },
          status: ReservationStatus.BOOKED,
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { roomId: true },
      }),
      this.prisma.roomMaintenance.findMany({
        where: {
          roomId: { in: roomIds },
          status: MaintenanceStatus.IN_PROGRESS,
          startAt: { lt: endAt },
          OR: [{ endAt: null }, { endAt: { gt: startAt } }],
        },
        select: { roomId: true },
      }),
    ]);
    const busyRoomIds = new Set([...busyReservations, ...busyMaintenances].map((r) => r.roomId));

    const withAvailability = rooms.map((r) => ({ ...r, available: !busyRoomIds.has(r.id) }));
    return this.attachActiveIssues(withAvailability);
  }

  // F-RSV-07: 선택한 날짜의 회의실 시간표 — 타 법인 예약은 익명화("예약됨"만)
  async getDayAvailability(roomId: string, date: string, requestingAccountId: string) {
    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59.999`);

    const [reservations, maintenances] = await Promise.all([
      this.prisma.reservation.findMany({
        where: {
          roomId,
          status: ReservationStatus.BOOKED,
          startAt: { lte: dayEnd },
          endAt: { gte: dayStart },
        },
        select: { id: true, startAt: true, endAt: true, accountId: true },
      }),
      this.prisma.roomMaintenance.findMany({
        where: {
          roomId,
          status: MaintenanceStatus.IN_PROGRESS,
          startAt: { lte: dayEnd },
          OR: [{ endAt: null }, { endAt: { gte: dayStart } }],
        },
        select: { startAt: true, endAt: true, reason: true },
      }),
    ]);

    const busySlots = reservations.map((r) => ({
      startAt: r.startAt,
      endAt: r.endAt,
      // 본인 예약만 식별 가능, 타 법인 예약은 '예약됨'으로만 노출(정보 보호)
      mine: r.accountId === requestingAccountId,
    }));

    return { busySlots, maintenances };
  }

  // F-ROOM-02 / C.2: 오늘 전체 회의실 예약 현황 (어드민)
  async getTodaySchedule() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    return this.prisma.meetingRoom.findMany({
      select: {
        id: true,
        name: true,
        reservations: {
          where: { status: ReservationStatus.BOOKED, startAt: { lte: dayEnd }, endAt: { gte: dayStart } },
          select: {
            id: true,
            startAt: true,
            endAt: true,
            account: { select: { name: true } },
            member: { select: { companyName: true, type: true } },
          },
          orderBy: { startAt: 'asc' },
        },
      },
    });
  }

  // 신규: 어드민 대시보드 — 오늘 예약 수 / 운영시간 기준 전체 슬롯 대비 예약된 슬롯 / 지금 사용 가능한 회의실
  async getTodaySummary() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const rooms = await this.prisma.meetingRoom.findMany({
      select: {
        id: true,
        name: true,
        reservations: {
          where: { status: ReservationStatus.BOOKED, startAt: { lte: dayEnd }, endAt: { gte: dayStart } },
          select: { startAt: true, endAt: true },
        },
      },
    });

    const slotsPerRoomPerDay = ((ROOM_CLOSE_HOUR - ROOM_OPEN_HOUR) * 60) / SLOT_MINUTES; // 운영시간·예약단위 기준 하루 슬롯 수
    const totalSlots = slotsPerRoomPerDay * rooms.length;

    let totalReservationsToday = 0;
    let bookedSlots = 0;
    const roomStatus = rooms.map((room) => {
      totalReservationsToday += room.reservations.length;
      bookedSlots += room.reservations.reduce(
        (sum, r) => sum + (r.endAt.getTime() - r.startAt.getTime()) / (1000 * 60 * SLOT_MINUTES),
        0,
      );
      const currentlyAvailable = !room.reservations.some((r) => r.startAt <= now && r.endAt > now);
      return { roomId: room.id, roomName: room.name, currentlyAvailable };
    });

    return { totalReservationsToday, totalSlots, bookedSlots: Math.round(bookedSlots), rooms: roomStatus };
  }

  // F-ROOM-03 / C.4: 회의실별 이번 달(캘린더 월) 이용률 — 어드민 전용
  async getUtilization(yearMonth?: string) {
    const now = new Date();
    const year = yearMonth ? Number(yearMonth.split('-')[0]) : now.getFullYear();
    const month = yearMonth ? Number(yearMonth.split('-')[1]) - 1 : now.getMonth();

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 1);
    const daysInMonth = (monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24);
    const availableHours = daysInMonth * DAILY_OPEN_HOURS;

    const rooms = await this.prisma.meetingRoom.findMany({
      select: {
        id: true,
        name: true,
        reservations: {
          where: { status: ReservationStatus.BOOKED, startAt: { gte: monthStart, lt: monthEnd } },
          select: { startAt: true, endAt: true },
        },
      },
    });

    return rooms.map((room) => {
      const bookedHours = room.reservations.reduce(
        (sum, r) => sum + (r.endAt.getTime() - r.startAt.getTime()) / (1000 * 60 * 60),
        0,
      );
      return {
        roomId: room.id,
        roomName: room.name,
        bookedHours,
        availableHours,
        utilization: availableHours > 0 ? bookedHours / availableHours : 0,
      };
    });
  }

  // 어드민: 회의실 등록/수정 (장비 연결 포함)
  async upsertRoom(dto: UpsertRoomDto, roomId?: string) {
    const data = {
      name: dto.name,
      capacity: dto.capacity,
      maintenanceIntervalDays: dto.maintenanceIntervalDays ?? null,
      ...(dto.floor !== undefined ? { floor: dto.floor } : {}),
      ...(dto.zone !== undefined ? { zone: dto.zone } : {}),
    };

    const room = roomId
      ? await this.prisma.meetingRoom.update({ where: { id: roomId }, data })
      : await this.prisma.meetingRoom.create({ data });

    if (dto.equipmentTypeIds) {
      await this.prisma.roomEquipment.deleteMany({ where: { roomId: room.id } });
      if (dto.equipmentTypeIds.length > 0) {
        await this.prisma.roomEquipment.createMany({
          data: dto.equipmentTypeIds.map((equipmentTypeId) => ({ roomId: room.id, equipmentTypeId })),
        });
      }
    }

    return room;
  }

  // F-ROOM-06: 다음 정기 점검 예정일 안내
  async getUpcomingMaintenanceSchedule() {
    const rooms = await this.prisma.meetingRoom.findMany({
      where: { maintenanceIntervalDays: { not: null } },
      include: {
        maintenances: {
          where: { status: MaintenanceStatus.COMPLETED },
          orderBy: { endAt: 'desc' },
          take: 1,
        },
      },
    });

    return rooms.map((room) => {
      const lastCompleted = room.maintenances[0]?.endAt;
      const baseline = lastCompleted ?? new Date();
      const nextDue = new Date(baseline);
      nextDue.setDate(nextDue.getDate() + (room.maintenanceIntervalDays ?? 0));
      return { roomId: room.id, roomName: room.name, nextDueDate: nextDue };
    });
  }

  async listEquipmentTypes() {
    return this.prisma.equipmentType.findMany({ orderBy: { name: 'asc' } });
  }

  async createEquipmentType(name: string) {
    return this.prisma.equipmentType.create({ data: { name } });
  }
}
