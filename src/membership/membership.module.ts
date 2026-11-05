import { Module } from '@nestjs/common';
import { MembershipController } from './membership.controller.js';
import { MembershipService } from './membership.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [MembershipController],
  providers: [MembershipService],
})
export class MembershipModule {}
