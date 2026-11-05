import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CustomerAuthController } from './customer-auth.controller.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { StaffAuthController } from './staff-auth.controller.js';
import { StaffAuthService } from './staff-auth.service.js';
import { JwtCustomerStrategy } from './strategies/jwt-customer.strategy.js';
import { JwtStaffStrategy } from './strategies/jwt-staff.strategy.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ?? '7d') as unknown as number,
        },
      }),
    }),
  ],
  controllers: [CustomerAuthController, StaffAuthController],
  providers: [CustomerAuthService, StaffAuthService, JwtCustomerStrategy, JwtStaffStrategy],
  exports: [JwtModule],
})
export class AuthModule {}
