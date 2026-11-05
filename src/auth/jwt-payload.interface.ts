import { CustomerAccountRole, StaffPosition } from '@prisma/client';

export interface CustomerJwtPayload {
  sub: string; // CustomerAccount.id
  kind: 'customer';
  memberId: string;
  role: CustomerAccountRole;
}

export interface StaffJwtPayload {
  sub: string; // Staff.id
  kind: 'staff';
  position: StaffPosition;
}
