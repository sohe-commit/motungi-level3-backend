import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service.js';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard.js';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CreateIssueReportDto } from './dto/create-issue-report.dto.js';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto.js';

@Controller()
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  // /facility/report/new — F-ROOM-04
  @UseGuards(CustomerJwtGuard)
  @Post('facility/reports')
  createIssueReport(@CurrentUser() user: any, @Body() dto: CreateIssueReportDto) {
    return this.maintenanceService.createIssueReport(user.id, dto);
  }

  // /facility/report/mine
  @UseGuards(CustomerJwtGuard)
  @Get('facility/reports/mine')
  listMyIssueReports(@CurrentUser() user: any) {
    return this.maintenanceService.listMyIssueReports(user.id);
  }

  // 어드민: 제보 처리함
  @UseGuards(StaffJwtGuard)
  @Get('admin/facility/reports')
  listIssueReports() {
    return this.maintenanceService.listIssueReports();
  }

  // 어드민: 점검 등록 (제보 연계 또는 자체 등록)
  @UseGuards(StaffJwtGuard)
  @Post('admin/facility/maintenances')
  createMaintenance(@CurrentUser() user: any, @Body() dto: CreateMaintenanceDto) {
    return this.maintenanceService.createMaintenance(user.id, dto);
  }

  @UseGuards(StaffJwtGuard)
  @Patch('admin/facility/maintenances/:id/complete')
  completeMaintenance(@Param('id') id: string, @Body('resolutionNotes') resolutionNotes?: string) {
    return this.maintenanceService.completeMaintenance(id, resolutionNotes);
  }

  @UseGuards(StaffJwtGuard)
  @Get('admin/facility/maintenances')
  listMaintenances() {
    return this.maintenanceService.listMaintenances();
  }
}
