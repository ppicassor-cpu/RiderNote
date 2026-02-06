export type TrackPoint = {
  lat: number;
  lng: number;
  t: number; // epoch ms
  acc?: number;
};

export type MemoPin = {
  lat: number;
  lng: number;
  t: number;    // savedAt epoch ms
  text: string; // clipboard text
};

export type SessionMeta = {
  sessionId: string;
  startTime: number;
  endTime: number;
  elapsedSec: number;
  totalDistanceM: number;
  memoCount: number;
};

export type SessionData = {
  session: SessionMeta;
  points: TrackPoint[];
  memos: MemoPin[];
};

export type ActiveStatus = {
  active: boolean;
  sessionId: string | null;
  startTime: number | null;
  paused: boolean;
  memoCount: number;
  totalDistanceM: number;
};
