export type UserRole = 'superadmin' | 'admin' | 'editor' | 'viewer';
export interface User { id: string; email: string; name: string; role: UserRole }
export interface Media {
  id: string; name: string; mime: string; size: number; url: string;
  checksum: string; createdAt: string;
}
export type SceneElementType = 'text' | 'image' | 'video' | 'shape' | 'clock' | 'qr';
export interface SceneElement {
  id: string; type: SceneElementType; x: number; y: number; width: number; height: number;
  text?: string; mediaId?: string; color?: string; background?: string;
  fontSize?: number; fontWeight?: number; opacity?: number; rotation?: number; zIndex?: number;
}
export interface Scene {
  id: string; name: string; width: number; height: number; background: string;
  elements: SceneElement[]; createdAt?: string; updatedAt?: string;
}
export interface PlaylistItem { id: string; type: 'media' | 'scene'; refId: string; duration: number }
export interface Program {
  id: string; name: string; items: PlaylistItem[]; publishedVersion?: number; createdAt?: string;
}
export interface PublishedProgram {
  id: string; name: string; version: number; items: PlaylistItem[]; scenes: Scene[]; media: Media[];
}
export interface Group { id: string; name: string }
export type Orientation = 'landscape' | 'portrait';
export interface Screen {
  id: string; name: string; groupId: string | null; orientation: Orientation;
  fallbackProgramId: string | null; lastSeen: string | null;
  currentProgramId?: string; online?: boolean;
}
export type ScheduleKind = 'weekly' | 'dated' | 'exception' | 'urgent';
export interface Schedule {
  id: string; name: string; programId: string; screenId: string | null; groupId: string | null;
  priority: number; kind: ScheduleKind; startDate: string; endDate: string;
  startTime: string; endTime: string; days: number[]; exclusions: string[]; timezone: string;
}
export interface Manifest {
  revision: string; serverTime: string; screen: Pick<Screen, 'id' | 'name' | 'orientation'>;
  fallbackProgramId: string | null; programs: PublishedProgram[]; schedules: Schedule[]; media: Media[];
}
export type CommandType = 'refresh' | 'clear-cache' | 'maintenance' | 'resume';
export interface DeviceCommand { id: string; type: CommandType }
export interface DeviceEvent {
  id?: string; screenId?: string; type: string; programId?: string; itemId?: string;
  message?: string; at?: string;
}
export interface PairRequest { requestId: string; code: string; expiresAt: string }
export interface PairStatus { status: 'pending' | 'paired' | 'expired'; token?: string; screenId?: string }
export interface Dashboard { screens: number; online: number; media: number; programs: number }
