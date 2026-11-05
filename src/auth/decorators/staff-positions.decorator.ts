import { SetMetadata } from '@nestjs/common';
import { StaffPosition } from '@prisma/client';

export const STAFF_POSITIONS_KEY = 'staffPositions';

// 어드민 메뉴/기능 접근을 직책으로 제한할 때 사용 (FR-AU9)
export const StaffPositions = (...positions: StaffPosition[]) =>
  SetMetadata(STAFF_POSITIONS_KEY, positions);
