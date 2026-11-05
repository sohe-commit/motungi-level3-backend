import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffPosition } from '@prisma/client';
import { STAFF_POSITIONS_KEY } from '../decorators/staff-positions.decorator.js';

// StaffJwtGuard 다음에 붙여서 쓴다 (req.user.position 전제)
@Injectable()
export class StaffPositionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<StaffPosition[]>(STAFF_POSITIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed || allowed.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user || !allowed.includes(user.position)) {
      throw new ForbiddenException('이 기능에 접근할 권한이 없습니다.');
    }
    return true;
  }
}
