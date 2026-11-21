import type { TaskStatus } from '../types/torrent';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 100 || idx === 0 ? val.toFixed(0) : val.toFixed(2)} ${units[idx]}`;
}

export function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return '0 B/s';
  return `${formatBytes(bps)}/s`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '--';
  if (seconds === 0) return '已完成';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, '0')}m`;
  if (mins > 0) return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `00:${String(secs).padStart(2, '0')}`;
}

export function formatPercent(downloaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (downloaded / total) * 100));
}

export const STATUS_META: Record<
  TaskStatus,
  { label: string; colorClass: string }
> = {
  resolving: { label: '解析元数据', colorClass: 'text-[#A8C7FA]' },
  queued: { label: '排队等待', colorClass: 'text-[#F59E0B]' },
  downloading: { label: '下载中', colorClass: 'text-[#22C55E]' },
  paused: { label: '已暂停', colorClass: 'text-[#9CA3AF]' },
  policy_paused: { label: '策略挂起', colorClass: 'text-[#F59E0B]' },
  seeding: { label: '做种中', colorClass: 'text-[#A8C7FA]' },
  completed: { label: '已完成', colorClass: 'text-[#A8C7FA]' },
  error: { label: '传输异常', colorClass: 'text-[#EF4444]' },
};
