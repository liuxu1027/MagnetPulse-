export type TaskStatus =
  | 'resolving'
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'policy_paused'
  | 'seeding'
  | 'completed'
  | 'error';

export type FilePriority = 'high' | 'normal' | 'low';

export interface TorrentFileItem {
  index: number;
  path: string;
  sizeBytes: number;
  downloadedBytes: number;
  selected: boolean;
  priority: FilePriority;
}

export interface PeerInfo {
  id: string;
  ip: string;
  port: number;
  client: string;
  country: string;
  downloadBps: number;
  uploadBps: number;
  progress: number;
  flags: string;
}

export interface TrackerInfo {
  url: string;
  status: 'working' | 'updating' | 'idle' | 'error';
  peers: number;
  lastAnnounce: string;
}

export interface TorrentTask {
  id: string;
  infoHash: string;
  name: string;
  magnetUri: string;
  status: TaskStatus;
  totalBytes: number;
  selectedBytes: number;
  downloadedBytes: number;
  uploadedBytes: number;
  downloadBps: number;
  uploadBps: number;
  etaSeconds: number | null;
  downloadLimitKbps: number;
  uploadLimitKbps: number;
  queueOrder: number;
  pieceCount: number;
  pieceSizeBytes: number;
  completedPieces: number[];
  fastResumeSavedAt: string;
  addedAt: string;
  completedAt: string | null;
  files: TorrentFileItem[];
  peers: PeerInfo[];
  trackers: TrackerInfo[];
  errorMessage: string | null;
}

export interface EnginePolicy {
  maxConcurrentDownloads: number;
  globalDownloadLimitKbps: number;
  globalUploadLimitKbps: number;
  wifiOnly: boolean;
  chargingOnly: boolean;
  fastResumeEnabled: boolean;
  savePath: string;
  simulatedNetwork: 'wifi' | 'cellular';
  simulatedCharging: boolean;
  remoteRqbitUrl: string;
}

export interface SpeedSample {
  time: string;
  downloadBps: number;
  uploadBps: number;
}

export interface NotificationItem {
  id: string;
  channel: 'progress' | 'complete' | 'policy';
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export interface EngineStateSnapshot {
  tasks: TorrentTask[];
  policy: EnginePolicy;
  totalDownloadBps: number;
  totalUploadBps: number;
  activeCount: number;
  queuedCount: number;
  fastResumeCount: number;
  speedHistory: SpeedSample[];
  notifications: NotificationItem[];
}

export interface ParsedMagnetPreview {
  valid: boolean;
  infoHash: string;
  name: string;
  magnetUri: string;
  totalBytes: number;
  trackers: string[];
  files: TorrentFileItem[];
  error?: string;
}

export interface NativeFileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: NativeFileNode[];
}
