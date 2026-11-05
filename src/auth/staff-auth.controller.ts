import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { StaffAuthService } from './staff-auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { StaffJwtGuard } from './guards/staff-jwt.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';

@Controller('auth/staff')
export class StaffAuthController {
  constructor(private readonly authService: StaffAuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // 어드민 사이드바에 "지금 로그인한 직원이 누구인지" 보여줄 때 사용
  @UseGuards(StaffJwtGuard)
  @Get('me')
  getMe(@CurrentUser() user: any) {
    return user;
  }

  @UseGuards(StaffJwtGuard)
  @Post('change-password')
  changePassword(@CurrentUser() user: { id: string }, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }
}
