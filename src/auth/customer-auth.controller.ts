import { Body, Controller, Post } from '@nestjs/common';
import { CustomerAuthService } from './customer-auth.service.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth/customer')
export class CustomerAuthController {
  constructor(private readonly authService: CustomerAuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
