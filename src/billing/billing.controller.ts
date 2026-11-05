import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service.js';
import { CustomerJwtGuard } from '../auth/guards/customer-jwt.guard.js';
import { StaffJwtGuard } from '../auth/guards/staff-jwt.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller()
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // /membership/overview — F-MBR-04
  @UseGuards(CustomerJwtGuard)
  @Get('membership/overview')
  getMyQuota(@CurrentUser() user: any) {
    return this.billingService.getQuotaSummary(user.memberId);
  }

  // /membership/billing — F-MBR-05 (본인 것)
  @UseGuards(CustomerJwtGuard)
  @Get('membership/billing')
  getMyBilling(@CurrentUser() user: any) {
    return this.billingService.getMonthlyCharge(user.memberId);
  }

  // /membership/company-usage — 고객 셀프서비스, 법인 소속 인원이면 누구나 조회 가능 (D.5)
  @UseGuards(CustomerJwtGuard)
  @Get('membership/company-usage')
  getMyCompanyUsage(@CurrentUser() user: any) {
    return this.billingService.getCompanyUsageBreakdown(user.memberId);
  }

  // /membership/refund-preview — (선택) 규정: 멤버십 해지 전 환불 예상 금액 미리보기
  @UseGuards(CustomerJwtGuard)
  @Get('membership/refund-preview')
  getMyRefundPreview(@CurrentUser() user: any) {
    return this.billingService.calculateRefund(user.memberId);
  }

  // 어드민: /billing/monthly — F-MBR-05 전체 목록
  @UseGuards(StaffJwtGuard)
  @Get('billing/monthly')
  listMonthlyCharges() {
    return this.billingService.listAllMonthlyCharges();
  }

  // 어드민: /billing/company-usage/:memberId — D.5
  @UseGuards(StaffJwtGuard)
  @Get('billing/company-usage/:memberId')
  getCompanyUsage(@Param('memberId') memberId: string) {
    return this.billingService.getCompanyUsageBreakdown(memberId);
  }
}
