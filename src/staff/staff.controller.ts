import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { StaffService } from './staff.service.js';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard.js';
import { StaffPositionsGuard } from '../auth/guards/staff-positions.guard.js';
import { StaffPositions } from '../auth/decorators/staff-positions.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { StaffPosition, StaffStatus } from '@prisma/client';

@UseGuards(StaffJwtGuard)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  list() {
    return this.staffService.listStaff();
  }

  // 계정 관리 메뉴 자체는 대표/권한관리자만 접근 (세부 대상 제한은 서비스에서)
  @UseGuards(StaffPositionsGuard)
  @StaffPositions(StaffPosition.CEO, StaffPosition.PERMISSION_ADMIN)
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateStaffDto) {
    return this.staffService.createStaff(user.position, dto);
  }

  @UseGuards(StaffPositionsGuard)
  @StaffPositions(StaffPosition.CEO, StaffPosition.PERMISSION_ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: Partial<CreateStaffDto>) {
    return this.staffService.updateStaff(user.position, id, dto);
  }

  @UseGuards(StaffPositionsGuard)
  @StaffPositions(StaffPosition.CEO, StaffPosition.PERMISSION_ADMIN)
  @Patch(':id/status')
  setStatus(@CurrentUser() user: any, @Param('id') id: string, @Body('status') status: StaffStatus) {
    return this.staffService.setStatus(user.position, id, status);
  }

  @UseGuards(StaffPositionsGuard)
  @StaffPositions(StaffPosition.CEO, StaffPosition.PERMISSION_ADMIN)
  @Post(':id/reset-password')
  resetPassword(@CurrentUser() user: any, @Param('id') id: string) {
    return this.staffService.resetPassword(user.position, id);
  }
}
