import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateIssueReportDto } from './dto/create-issue-report.dto.js';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto.js';
import { MaintenanceStatus, ReportStatus } from '@prisma/client';

@Injectable()
export class MaintenanceService {
  constructor(private readonly prisma: PrismaService) {}

  // F-ROOM-04: 고객이 고장/문제를 제보
  createIssueReport(accountId: string, dto: CreateIssueReportDto) {
    return this.prisma.issueReport.create({
      data: { roomId: dto.roomId, accountId, content: dto.content, status: ReportStatus.RECEIVED },
    });
  }

  listMyIssueReports(accountId: string) {
    return this.prisma.issueReport.findMany({
      where: { accountId },
      include: { room: { select: { name: true } } },
      orderBy: { reportedAt: 'desc' },
    });
  }

  // 어드민: 제보 처리함 — 담당자(처리한 직원)·완료일·처리 내용은 연결된 점검 기록에서 가져온다
  listIssueReports() {
    return this.prisma.issueReport.findMany({
      include: {
        room: { select: { name: true } },
        account: { select: { name: true, email: true } },
        maintenance: { select: { staff: { select: { name: true } }, endAt: true, resolutionNotes: true } },
      },
      orderBy: { reportedAt: 'desc' },
    });
  }

  // F-ROOM-05: 제보 연계 또는 직원이 제보 없이 자체 등록(정기 점검 등)
  async createMaintenance(staffId: string, dto: CreateMaintenanceDto) {
    return this.prisma.$transaction(async (tx) => {
      const maintenance = await tx.roomMaintenance.create({
        data: {
          roomId: dto.roomId,
          staffId,
          reason: dto.reason,
          startAt: new Date(dto.startAt),
          status: MaintenanceStatus.IN_PROGRESS,
        },
      });

      if (dto.reportId) {
        await tx.issueReport.update({
          where: { id: dto.reportId },
          data: { maintenanceId: maintenance.id, status: ReportStatus.IN_PROGRESS },
        });
      }

      return maintenance;
    });
  }

  // 점검 완료 처리 — 연결된 제보도 함께 완료 처리
  async completeMaintenance(maintenanceId: string, resolutionNotes?: string) {
    const maintenance = await this.prisma.roomMaintenance.findUnique({ where: { id: maintenanceId } });
    if (!maintenance) throw new NotFoundException('점검 기록을 찾을 수 없습니다.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.roomMaintenance.update({
        where: { id: maintenanceId },
        data: { endAt: new Date(), status: MaintenanceStatus.COMPLETED, resolutionNotes },
      });
      await tx.issueReport.updateMany({
        where: { maintenanceId },
        data: { status: ReportStatus.COMPLETED },
      });
      return updated;
    });
  }

  listMaintenances(roomId?: string) {
    return this.prisma.roomMaintenance.findMany({
      where: roomId ? { roomId } : undefined,
      include: { room: { select: { name: true } }, staff: { select: { name: true } } },
      orderBy: { startAt: 'desc' },
    });
  }
}
