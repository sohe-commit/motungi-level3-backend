import { Module } from '@nestjs/common';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { BillingModule } from '../billing/billing.module.js';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
