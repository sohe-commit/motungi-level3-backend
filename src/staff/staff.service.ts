import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { StaffPosition, StaffStatus } from '@prisma/client';

const SALT_ROUNDS = 10;

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  // F-STF-01
  listStaff() {
    return this.prisma.staff.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        position: true,
        team: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // F-AUTH-06: 대표/권한관리자만 생성 가능. 권한관리자는 일반관리자만 만들 수 있다.
  async createStaff(actorPosition: StaffPosition, dto: CreateStaffDto) {
    this.assertCanManage(actorPosition, dto.position);

    const existing = await this.prisma.staff.findUnique({ where: { email: dto.email } });
    if (existing) throw new ForbiddenException('이미 사용 중인 이메일입니다.');

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);

    const staff = await this.prisma.staff.create({
      data: {
        email: dto.email,
        name: dto.name,
        position: dto.position,
        team: dto.team,
        passwordHash,
        mustChangePassword: true, // FR-AU11
      },
    });

    // 실제 서비스라면 이메일 발송 — 과제 범위에서는 응답으로 반환
    return { staff, tempPassword };
  }

  // F-AUTH-06: 정보 수정
  async updateStaff(actorPosition: StaffPosition, staffId: string, dto: Partial<CreateStaffDto>) {
    const target = await this.getStaffOrThrow(staffId);
    this.assertCanManage(actorPosition, target.position);
    if (dto.position) this.assertCanManage(actorPosition, dto.position);

    return this.prisma.staff.update({
      where: { id: staffId },
      data: { name: dto.name, position: dto.position, team: dto.team },
    });
  }

  // F-AUTH-06: 정지 (상태 토글)
  async setStatus(actorPosition: StaffPosition, staffId: string, status: StaffStatus) {
    const target = await this.getStaffOrThrow(staffId);
    this.assertCanManage(actorPosition, target.position);

    return this.prisma.staff.update({ where: { id: staffId }, data: { status } });
  }

  // F-AUTH-07: 비밀번호 리셋 → 임시 비밀번호 발급, 다음 로그인 시 강제 변경
  async resetPassword(actorPosition: StaffPosition, staffId: string) {
    const target = await this.getStaffOrThrow(staffId);
    this.assertCanManage(actorPosition, target.position);

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);
    await this.prisma.staff.update({
      where: { id: staffId },
      data: { passwordHash, mustChangePassword: true },
    });
    return { tempPassword };
  }

  // 대표(CEO): 전체 대상. 권한관리자(PERMISSION_ADMIN): 일반관리자(GENERAL_ADMIN)만 대상 가능.
  private assertCanManage(actorPosition: StaffPosition, targetPosition: StaffPosition) {
    if (actorPosition === StaffPosition.CEO) return;
    if (actorPosition === StaffPosition.PERMISSION_ADMIN && targetPosition === StaffPosition.GENERAL_ADMIN) {
      return;
    }
    throw new ForbiddenException('해당 직원 계정을 관리할 권한이 없습니다.');
  }

  private async getStaffOrThrow(staffId: string) {
    const staff = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException('직원을 찾을 수 없습니다.');
    return staff;
  }

  private generateTempPassword() {
    return crypto.randomBytes(9).toString('base64url'); // 12자 내외의 임시 비밀번호
  }
}
