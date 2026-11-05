import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard.js';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard.js';
import { AnyJwtGuard } from '../auth/guards/any-jwt.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { UpsertRoomDto } from './dto/upsert-room.dto.js';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  // F-RSV-05 — 로그인한 고객이면 누구나 조회 가능. 어드민 회의실 관리 화면도 같은 목록을 쓴다
  @UseGuards(AnyJwtGuard)
  @Get()
  listRooms(@Query('equipmentTypeId') equipmentTypeId?: string) {
    return this.roomsService.listRooms(equipmentTypeId);
  }

  // 조건(날짜/시간/인원/장비) 먼저 받아 그 조건에 맞는 회의실만 가용 여부와 함께 보여준다
  @UseGuards(CustomerJwtGuard)
  @Get('available')
  findAvailableRooms(
    @Query('date') date: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('attendeeCount') attendeeCount?: string,
    @Query('equipmentTypeId') equipmentTypeId?: string,
  ) {
    const startAt = new Date(`${date}T${startTime}:00`);
    const endAt = new Date(`${date}T${endTime}:00`);
    return this.roomsService.findAvailableRooms(
      startAt,
      endAt,
      attendeeCount ? Number(attendeeCount) : undefined,
      equipmentTypeId,
    );
  }

  // F-RSV-07
  @UseGuards(CustomerJwtGuard)
  @Get(':id/availability')
  getAvailability(
    @Param('id') id: string,
    @Query('date') date: string,
    @CurrentUser() user: any,
  ) {
    return this.roomsService.getDayAvailability(id, date, user.id);
  }

  @UseGuards(StaffJwtGuard)
  @Get('admin/today-schedule')
  getTodaySchedule() {
    return this.roomsService.getTodaySchedule();
  }

  // 신규: 대시보드 — 오늘 예약 수/슬롯 사용률/지금 사용 가능한 회의실
  @UseGuards(StaffJwtGuard)
  @Get('admin/today-summary')
  getTodaySummary() {
    return this.roomsService.getTodaySummary();
  }

  @UseGuards(StaffJwtGuard)
  @Get('admin/utilization')
  getUtilization(@Query('yearMonth') yearMonth?: string) {
    return this.roomsService.getUtilization(yearMonth);
  }

  @UseGuards(StaffJwtGuard)
  @Get('admin/upcoming-maintenance')
  getUpcomingMaintenance() {
    return this.roomsService.getUpcomingMaintenanceSchedule();
  }

  @UseGuards(StaffJwtGuard)
  @Post('admin')
  createRoom(@Body() dto: UpsertRoomDto) {
    return this.roomsService.upsertRoom(dto);
  }

  @UseGuards(StaffJwtGuard)
  @Patch('admin/:id')
  updateRoom(@Param('id') id: string, @Body() dto: UpsertRoomDto) {
    return this.roomsService.upsertRoom(dto, id);
  }

  @UseGuards(AnyJwtGuard)
  @Get('equipment-types')
  listEquipmentTypes() {
    return this.roomsService.listEquipmentTypes();
  }

  @UseGuards(StaffJwtGuard)
  @Post('equipment-types')
  createEquipmentType(@Body('name') name: string) {
    return this.roomsService.createEquipmentType(name);
  }
}
