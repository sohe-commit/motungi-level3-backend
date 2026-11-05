import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ReservationsService } from './reservations.service.js';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard.js';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { ReservationStatus } from '@prisma/client';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @UseGuards(CustomerJwtGuard)
  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateReservationDto) {
    return this.reservationsService.create(user, dto);
  }

  @UseGuards(CustomerJwtGuard)
  @Patch(':id/cancel')
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.reservationsService.cancel(user, id);
  }

  @UseGuards(CustomerJwtGuard)
  @Get('mine')
  listMine(@CurrentUser() user: any) {
    return this.reservationsService.listMine(user);
  }

  @UseGuards(StaffJwtGuard)
  @Get('admin')
  listAllForAdmin() {
    return this.reservationsService.listAllForAdmin();
  }

  @UseGuards(StaffJwtGuard)
  @Patch('admin/:id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: ReservationStatus) {
    return this.reservationsService.updateStatusAsAdmin(id, status);
  }
}
