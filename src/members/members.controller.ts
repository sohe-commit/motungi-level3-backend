import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MembersService } from './members.service.js';
import { AddCompanyMemberDto } from './dto/add-company-member.dto.js';
import { SetOverageDto } from './dto/set-overage.dto.js';
import { CustomerAccountRole } from '@prisma/client';

@UseGuards(CustomerJwtGuard)
@Controller()
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  // /me — 대시보드에서 개인/법인 여부를 판단하는 용도
  @Get('me')
  getMe(@CurrentUser() user: any) {
    return this.membersService.getMe(user);
  }

  // /company/members
  @Get('company/members')
  listCompanyMembers(@CurrentUser() user: any) {
    return this.membersService.listCompanyMembers(user);
  }

  @Post('company/members')
  addCompanyMember(@CurrentUser() user: any, @Body() dto: AddCompanyMemberDto) {
    return this.membersService.addCompanyMember(user, dto);
  }

  @Patch('company/members/:id/role')
  changeRole(@CurrentUser() user: any, @Param('id') id: string, @Body('role') role: CustomerAccountRole) {
    return this.membersService.changeRole(user, id, role);
  }

  @Patch('company/members/:id/deactivate')
  deactivateMember(@CurrentUser() user: any, @Param('id') id: string) {
    return this.membersService.deactivateMember(user, id);
  }

  @Post('company/terminate')
  terminateCompany(@CurrentUser() user: any) {
    return this.membersService.terminateCompany(user);
  }

  // /reservations/team
  @Get('reservations/team')
  listTeamReservations(@CurrentUser() user: any) {
    return this.membersService.listTeamReservations(user);
  }

  // /membership/overage
  @Patch('membership/overage')
  setOverage(@CurrentUser() user: any, @Body() dto: SetOverageDto) {
    return this.membersService.setOverage(user, dto);
  }
}
