import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { MembersModule } from './members/members.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { ReservationsModule } from './reservations/reservations.module.js';
import { MembershipModule } from './membership/membership.module.js';
import { BillingModule } from './billing/billing.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { StaffModule } from './staff/staff.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    MembersModule,
    RoomsModule,
    ReservationsModule,
    MembershipModule,
    BillingModule,
    MaintenanceModule,
    StaffModule,
  ],
})
export class AppModule {}
