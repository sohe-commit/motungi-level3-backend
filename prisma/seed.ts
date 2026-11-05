// 시드 데이터 — 전부 가상 데이터입니다 (실제 개인정보 사용 금지 수칙 준수)
import {
  PrismaClient,
  MemberType,
  CustomerAccountRole,
  StaffPosition,
  MembershipTypeCode,
  SpaceType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  console.log('시드 데이터 생성 시작...');

  // --- 직원 (운영측) ---
  const ceoPassword = await bcrypt.hash('TempPass!2026', SALT_ROUNDS);
  await prisma.staff.upsert({
    where: { email: 'ceo@motungi.example' },
    update: {},
    create: {
      email: 'ceo@motungi.example',
      passwordHash: ceoPassword,
      name: '김대표',
      position: StaffPosition.CEO,
      team: '경영지원',
      mustChangePassword: false,
    },
  });

  const adminPassword = await bcrypt.hash('TempPass!2026', SALT_ROUNDS);
  await prisma.staff.upsert({
    where: { email: 'hr@motungi.example' },
    update: {},
    create: {
      email: 'hr@motungi.example',
      passwordHash: adminPassword,
      name: '박권한',
      position: StaffPosition.PERMISSION_ADMIN,
      team: '인사팀',
      mustChangePassword: false,
    },
  });

  const staffPassword = await bcrypt.hash('TempPass!2026', SALT_ROUNDS);
  await prisma.staff.upsert({
    where: { email: 'staff@motungi.example' },
    update: {},
    create: {
      email: 'staff@motungi.example',
      passwordHash: staffPassword,
      name: '이매니저',
      position: StaffPosition.GENERAL_ADMIN,
      team: '운영팀',
      mustChangePassword: false,
    },
  });

  // --- 멤버십종류 ---
  // code: 공간 배정 검증에 쓰는 고정 코드(이름은 바뀌어도 코드는 안 바뀜)
  const freeSeat = await prisma.membershipType.upsert({
    where: { id: 'seed-free-seat' },
    update: {},
    create: {
      id: 'seed-free-seat',
      code: MembershipTypeCode.FREE_SEAT,
      name: '자유석',
      monthlyFee: 150000,
      monthlyUsageHours: 4,
    },
  });
  const fixedSeat = await prisma.membershipType.upsert({
    where: { id: 'seed-fixed-seat' },
    update: {},
    create: {
      id: 'seed-fixed-seat',
      code: MembershipTypeCode.FIXED_SEAT,
      name: '고정석',
      monthlyFee: 350000,
      monthlyUsageHours: 10,
    },
  });
  const office = await prisma.membershipType.upsert({
    where: { id: 'seed-office' },
    update: {},
    create: {
      id: 'seed-office',
      code: MembershipTypeCode.OFFICE,
      name: '오피스',
      monthlyFee: 800000,
      monthlyUsageHours: 20,
    },
  });

  // --- 장비종류 ---
  const videoConf = await prisma.equipmentType.upsert({
    where: { id: 'seed-eq-video' },
    update: {},
    create: { id: 'seed-eq-video', name: '화상회의장비' },
  });
  const whiteboard = await prisma.equipmentType.upsert({
    where: { id: 'seed-eq-whiteboard' },
    update: {},
    create: { id: 'seed-eq-whiteboard', name: '화이트보드' },
  });

  // --- 회의실 ---
  const roomA = await prisma.meetingRoom.upsert({
    where: { id: 'seed-room-a' },
    update: {},
    create: {
      id: 'seed-room-a',
      name: '회의실 A',
      capacity: 4,
      maintenanceIntervalDays: 90,
      floor: 1,
      zone: '1층 서쪽 복도',
    },
  });
  const roomB = await prisma.meetingRoom.upsert({
    where: { id: 'seed-room-b' },
    update: {},
    create: {
      id: 'seed-room-b',
      name: '회의실 B',
      capacity: 8,
      maintenanceIntervalDays: 90,
      floor: 1,
      zone: '1층 동쪽 복도',
    },
  });
  await prisma.meetingRoom.upsert({
    where: { id: 'seed-room-c' },
    update: {},
    create: { id: 'seed-room-c', name: '회의실 C (대회의실)', capacity: 12, floor: 2, zone: '2층 중앙' },
  });

  await prisma.roomEquipment.createMany({
    data: [
      { roomId: roomA.id, equipmentTypeId: videoConf.id },
      { roomId: roomB.id, equipmentTypeId: videoConf.id },
      { roomId: roomB.id, equipmentTypeId: whiteboard.id },
    ],
    skipDuplicates: true,
  });

  // --- 개인 멤버 샘플 ---
  const individualPassword = await bcrypt.hash('TempPass!2026', SALT_ROUNDS);
  const individualMember = await prisma.member.upsert({
    where: { id: 'seed-member-individual' },
    update: {},
    create: { id: 'seed-member-individual', type: MemberType.INDIVIDUAL },
  });
  await prisma.customerAccount.upsert({
    where: { email: 'hong@example.com' },
    update: {},
    create: {
      email: 'hong@example.com',
      passwordHash: individualPassword,
      name: '홍길동',
      memberId: individualMember.id,
      role: CustomerAccountRole.MEMBER_USER,
    },
  });

  // --- 법인 멤버 샘플 ---
  const companyMember = await prisma.member.upsert({
    where: { id: 'seed-member-company' },
    update: {},
    create: { id: 'seed-member-company', type: MemberType.COMPANY, companyName: '(주)가나다' },
  });
  const companyAdminPassword = await bcrypt.hash('TempPass!2026', SALT_ROUNDS);
  await prisma.customerAccount.upsert({
    where: { email: 'admin@ganada.example' },
    update: {},
    create: {
      email: 'admin@ganada.example',
      passwordHash: companyAdminPassword,
      name: '최대표',
      memberId: companyMember.id,
      role: CustomerAccountRole.SUPER_ADMIN,
    },
  });
  const companyStaffPassword = await bcrypt.hash('TempPass!2026', SALT_ROUNDS);
  await prisma.customerAccount.upsert({
    where: { email: 'staff1@ganada.example' },
    update: {},
    create: {
      email: 'staff1@ganada.example',
      passwordHash: companyStaffPassword,
      name: '정직원',
      memberId: companyMember.id,
      role: CustomerAccountRole.MEMBER_USER,
    },
  });

  // --- 법인 멤버 샘플 2 (고정석 멤버십 — SEAT 배정 검증용) ---
  const companyMember2 = await prisma.member.upsert({
    where: { id: 'seed-member-company2' },
    update: {},
    create: { id: 'seed-member-company2', type: MemberType.COMPANY, companyName: '(주)나다라' },
  });
  const companyAdmin2Password = await bcrypt.hash('TempPass!2026', SALT_ROUNDS);
  await prisma.customerAccount.upsert({
    where: { email: 'admin@nadara.example' },
    update: {},
    create: {
      email: 'admin@nadara.example',
      passwordHash: companyAdmin2Password,
      name: '박대표',
      memberId: companyMember2.id,
      role: CustomerAccountRole.SUPER_ADMIN,
    },
  });

  // --- 멤버십이력 (이번 결제 주기, 오늘 기준 ±) ---
  const cycleStart = new Date();
  cycleStart.setDate(cycleStart.getDate() - 10);
  const cycleEnd = new Date(cycleStart);
  cycleEnd.setMonth(cycleEnd.getMonth() + 1);

  await prisma.membershipHistory.createMany({
    data: [
      { memberId: individualMember.id, membershipTypeId: freeSeat.id, startDate: cycleStart, endDate: cycleEnd },
      { memberId: companyMember.id, membershipTypeId: office.id, startDate: cycleStart, endDate: cycleEnd },
      { memberId: companyMember2.id, membershipTypeId: fixedSeat.id, startDate: cycleStart, endDate: cycleEnd },
    ],
  });

  // --- 가상의 건물 구조도(마스터 데이터) ---
  // 2층 일반석 구역: 고정석으로 배정 가능한 자리 A-01~A-15 (배정되지 않은 나머지는 자유석으로 오픈 사용)
  await prisma.buildingSpace.createMany({
    data: Array.from({ length: 15 }, (_, i) => ({
      spaceType: SpaceType.SEAT,
      spaceNumber: `A-${String(i + 1).padStart(2, '0')}`,
      floor: 2,
      zone: '2층 일반석 구역',
    })),
    skipDuplicates: true,
  });
  // 3층 오피스 구역: 호실 301~306호
  await prisma.buildingSpace.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({
      spaceType: SpaceType.OFFICE,
      spaceNumber: `${301 + i}호`,
      floor: 3,
      zone: '3층 오피스 구역',
    })),
    skipDuplicates: true,
  });

  // --- 전용공간배정 샘플 ---
  // (주)가나다 = 오피스 멤버십 → 오피스 호실 배정
  await prisma.spaceAssignment.upsert({
    where: { id: 'seed-space-office' },
    update: {},
    create: {
      id: 'seed-space-office',
      spaceType: SpaceType.OFFICE,
      spaceNumber: '301호',
      memberId: companyMember.id,
      startDate: cycleStart,
      endDate: cycleEnd,
    },
  });
  // (주)나다라 = 고정석 멤버십 → 고정석 자리 배정
  await prisma.spaceAssignment.upsert({
    where: { id: 'seed-space-seat' },
    update: {},
    create: {
      id: 'seed-space-seat',
      spaceType: SpaceType.SEAT,
      spaceNumber: 'A-12',
      memberId: companyMember2.id,
      startDate: cycleStart,
      endDate: cycleEnd,
    },
  });

  // --- 예약 샘플 (내일 오전 10~11시, 회의실 A) ---
  const companyStaffAccount = await prisma.customerAccount.findUniqueOrThrow({
    where: { email: 'staff1@ganada.example' },
  });
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrow);
  tomorrowEnd.setHours(11, 0, 0, 0);

  await prisma.reservation.upsert({
    where: { id: 'seed-reservation-1' },
    update: {},
    create: {
      id: 'seed-reservation-1',
      roomId: roomA.id,
      accountId: companyStaffAccount.id,
      memberId: companyMember.id,
      startAt: tomorrow,
      endAt: tomorrowEnd,
      attendeeCount: 3,
    },
  });

  console.log('시드 데이터 생성 완료.');
  console.log('모든 계정의 초기 비밀번호: TempPass!2026 (가상 데이터, 로컬 테스트 전용)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
