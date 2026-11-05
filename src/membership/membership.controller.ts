import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { MembershipService } from './membership.service.js';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard.js';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CreateMembershipTypeDto } from './dto/create-membership-type.dto.js';
import { StartMembershipDto } from './dto/start-membership.dto.js';
import { SpaceType } from '@prisma/client';

@Controller()
export class MembershipController {
  constructor(private readonly membershipService: MembershipService) {}

  @UseGuards(CustomerJwtGuard)
  @Get('membership/types')
  listTypes() {
    return this.membershipService.listMembershipTypes();
  }

  @UseGuards(StaffJwtGuard)
  @Post('membership/types')
  createType(@Body() dto: CreateMembershipTypeDto) {
    return this.membershipService.createMembershipType(dto);
  }

  // /membership/change — F-MBR-01 (고객 셀프서비스)
  @UseGuards(CustomerJwtGuard)
  @Patch('membership/change')
  changeMembership(@CurrentUser() user: any, @Body('membershipTypeId') membershipTypeId: string) {
    return this.membershipService.changeMembership(user.memberId, membershipTypeId);
  }

  // /membership/subscribe — 고객 셀프서비스 첫 구독 (가입 직후 안내 흐름에서 사용)
  @UseGuards(CustomerJwtGuard)
  @Post('membership/subscribe')
  subscribe(@CurrentUser() user: any, @Body('membershipTypeId') membershipTypeId: string) {
    return this.membershipService.subscribe(user.memberId, membershipTypeId);
  }

  // 어드민: 최초 가입 등록
  @UseGuards(StaffJwtGuard)
  @Post('admin/members/:memberId/membership')
  startMembership(@Param('memberId') memberId: string, @Body() dto: StartMembershipDto) {
    return this.membershipService.startMembership(memberId, dto);
  }

  @UseGuards(StaffJwtGuard)
  @Get('admin/members')
  listMembers() {
    return this.membershipService.listMembers();
  }

  @UseGuards(StaffJwtGuard)
  @Get('admin/members/expiring')
  getExpiringMembers(@Query('yearMonth') yearMonth?: string) {
    return this.membershipService.getExpiringMembers(yearMonth);
  }

  // 어드민: 전용공간(고정석/오피스) 배정 — 공간 유형과 멤버의 현재 멤버십이 일치해야 함
  @UseGuards(StaffJwtGuard)
  @Post('admin/space-assignments')
  assignSpace(
    @Body('memberId') memberId: string,
    @Body('spaceType') spaceType: SpaceType,
    @Body('spaceNumber') spaceNumber: string,
    @Body('startDate') startDate: string,
    @Body('endDate') endDate: string,
  ) {
    return this.membershipService.assignSpace(memberId, spaceType, spaceNumber, startDate, endDate);
  }

  @UseGuards(StaffJwtGuard)
  @Get('admin/space-assignments')
  listSpaceAssignments() {
    return this.membershipService.listSpaceAssignments();
  }

  // 어드민 대시보드: 자유석/고정석/오피스 전체 현황 요약
  @UseGuards(StaffJwtGuard)
  @Get('admin/space-summary')
  getSpaceSummary() {
    return this.membershipService.getSpaceSummary();
  }

  // /membership/my-space — 고객 셀프서비스, 고정석·오피스 멤버용
  @UseGuards(CustomerJwtGuard)
  @Get('membership/my-space')
  getMySpace(@CurrentUser() user: any) {
    return this.membershipService.getMySpace(user.memberId);
  }

  // /membership/available-spaces — 가상의 건물 구조도: 내 멤버십에 맞는 공간 유형 전체를 사용 가능 여부와 함께 조회
  @UseGuards(CustomerJwtGuard)
  @Get('membership/available-spaces')
  listAvailableSpaces(@Query('spaceType') spaceType: SpaceType) {
    return this.membershipService.listAvailableSpaces(spaceType);
  }

  // /membership/my-space — 건물 구조도에서 비어있는 자리를 직접 선택해 배정받는다
  @UseGuards(CustomerJwtGuard)
  @Post('membership/my-space')
  selfAssignSpace(@CurrentUser() user: any, @Body('spaceNumber') spaceNumber: string) {
    return this.membershipService.selfAssignSpace(user, spaceNumber);
  }
}
