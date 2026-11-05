// B.1: 회의실 예약은 08:00~22:00 안에서만, 30분 단위
export const ROOM_OPEN_HOUR = 8;
export const ROOM_CLOSE_HOUR = 22;
export const SLOT_MINUTES = 30;
export const DAILY_OPEN_HOURS = ROOM_CLOSE_HOUR - ROOM_OPEN_HOUR; // 14시간
