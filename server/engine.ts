import fs from 'fs';
import path from 'path';
import type {
  EnginePolicy,
  EngineStateSnapshot,
  FilePriority,
  NotificationItem,
  PeerInfo,
  SpeedSample,
  TorrentFileItem,
  TorrentTask,
  TrackerInfo,
} from '../src/types/torrent.ts';
import { parseMagnetUri } from './magnetParser.ts';

interface PersistedData {
  tasks: TorrentTask[];
  policy: EnginePolicy;
  notifications: NotificationItem[];
  savedAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'session_state.json');

const PEER_CLIENTS = [
  'rqbit 8.1.0',
  'qBittorrent/5.0.2',
  'Transmission 4.0.6',
  'libtorrent 2.0.10',
  'Deluge 2.1.1',
];

const PEER_REGIONS = ['SG', 'JP', 'US', 'DE', 'HK', 'NL'];

function formatClock(date: Date): string {
  return date.toTimeString().slice(0, 8);
}

function buildBitfield(pieceCount: number, ratio: number): number[] {
  const filled = Math.round(pieceCount * Math.max(0, Math.min(1, ratio)));
  const arr = new Array<number>(pieceCount).fill(0);
  for (let i = 0; i < filled; i++) {
    arr[i] = 1;
  }
  return arr;
}

function generatePeers(infoHash: string, count: number, active: boolean): PeerInfo[] {
  if (!active || count === 0) return [];
  const peers: PeerInfo[] = [];
  for (let i = 0; i < count; i++) {
    const seed = infoHash.charCodeAt(i % infoHash.length) + i * 37;
    const ip = `${18 + (seed % 180)}.${40 + ((seed * 3) % 200)}.${10 + ((seed * 7) % 230)}.${2 + ((seed * 11) % 240)}`;
    const dl = Math.floor(380_000 + ((seed * 1391) % 2_400_000));
    const ul = Math.floor(24_000 + ((seed * 419) % 190_000));
    peers.push({
      id: `peer-${infoHash.slice(0, 6)}-${i}`,
      ip,
      port: 51413 + (seed % 12000),
      client: PEER_CLIENTS[seed % PEER_CLIENTS.length],
      country: PEER_REGIONS[seed % PEER_REGIONS.length],
      downloadBps: dl,
      uploadBps: ul,
      progress: Number((0.42 + ((seed % 58) / 100)).toFixed(2)),
      flags: i % 2 === 0 ? 'D H E' : 'D U E',
    });
  }
  return peers;
}

function buildSeedTasks(): TorrentTask[] {
  const now = new Date();
  const ubuntuUri =
    'magnet:?xt=urn:btih:2c6b6858d61da9543d4231a71db4b1c9264b0685&dn=ubuntu-24.04.1-desktop-amd64.iso&tr=https%3A%2F%2Ftorrent.ubuntu.com%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce';
  const blenderUri =
    'magnet:?xt=urn:btih:7e4c19a2f08d6c4b1130e8b8f91544d3802a9e12&dn=Blender-4.3-Open-Movie-Benchmark-Bundle&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce';
  const archUri =
    'magnet:?xt=urn:btih:f491a7c82b039d11e5840f62c7b194d38a62e077&dn=archlinux-2026.11.01-x86_64-bundle&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce';
  const debianUri =
    'magnet:?xt=urn:btih:a8d41f3c92b0e4471190c3b208f75e6a4b12d901&dn=debian-12.7.0-amd64-netinst-archive&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce';

  const makeTask = (
    id: string,
    uri: string,
    status: TorrentTask['status'],
    ratio: number,
    queueOrder: number,
    peerCount: number
  ): TorrentTask => {
    const parsed = parseMagnetUri(uri);
    const files: TorrentFileItem[] = parsed.files.map((f) => ({
      ...f,
      downloadedBytes: Math.round(f.sizeBytes * ratio),
    }));
    const selectedBytes = files.reduce((s, f) => s + (f.selected ? f.sizeBytes : 0), 0);
    const downloadedBytes = files.reduce((s, f) => s + (f.selected ? f.downloadedBytes : 0), 0);
    const pieceCount = 64;
    const trackers: TrackerInfo[] = parsed.trackers.map((t, idx) => ({
      url: t,
      status: status === 'downloading' || status === 'seeding' ? 'working' : 'idle',
      peers: status === 'downloading' ? 14 - idx * 3 : 0,
      lastAnnounce: formatClock(now),
    }));

    return {
      id,
      infoHash: parsed.infoHash,
      name: parsed.name,
      magnetUri: uri,
      status,
      totalBytes: parsed.totalBytes,
      selectedBytes,
      downloadedBytes,
      uploadedBytes: Math.round(downloadedBytes * 0.24),
      downloadBps: status === 'downloading' ? 8_420_000 : 0,
      uploadBps: status === 'downloading' ? 420_000 : status === 'seeding' ? 680_000 : 0,
      etaSeconds: status === 'downloading' ? Math.round((selectedBytes - downloadedBytes) / 8_420_000) : null,
      downloadLimitKbps: 0,
      uploadLimitKbps: 0,
      queueOrder,
      pieceCount,
      pieceSizeBytes: Math.max(262_144, Math.floor(parsed.totalBytes / pieceCount)),
      completedPieces: buildBitfield(pieceCount, ratio),
      fastResumeSavedAt: now.toISOString(),
      addedAt: new Date(now.getTime() - (5 - queueOrder) * 180_000).toISOString(),
      completedAt: status === 'completed' || status === 'seeding' ? now.toISOString() : null,
      files,
      peers: generatePeers(parsed.infoHash, peerCount, status === 'downloading' || status === 'seeding'),
      trackers,
      errorMessage: null,
    };
  };

  return [
    makeTask('task-ubuntu-2404', ubuntuUri, 'downloading', 0.41, 1, 7),
    makeTask('task-blender-43', blenderUri, 'downloading', 0.68, 2, 6),
    makeTask('task-arch-2026', archUri, 'queued', 0.12, 3, 0),
    makeTask('task-debian-12', debianUri, 'completed', 1.0, 4, 0),
  ];
}

export class MagnetPulseEngine {
  private tasks: TorrentTask[] = [];
  private policy: EnginePolicy = {
    maxConcurrentDownloads: 2,
    globalDownloadLimitKbps: 0,
    globalUploadLimitKbps: 1024,
    wifiOnly: true,
    chargingOnly: false,
    fastResumeEnabled: true,
    savePath: '/storage/emulated/0/Download/MagnetPulse',
    simulatedNetwork: 'wifi',
    simulatedCharging: true,
    remoteRqbitUrl: '',
  };
  private notifications: NotificationItem[] = [];
  private speedHistory: SpeedSample[] = [];
  private timer: NodeJS.Timeout | null = null;
  private tickCounter = 0;

  constructor() {
    this.loadFromDisk();
    this.reconcileConcurrencyAndPolicy();
    this.startLoop();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as PersistedData;
        if (Array.isArray(parsed.tasks) && parsed.tasks.length > 0) {
          this.tasks = parsed.tasks;
          this.policy = { ...this.policy, ...parsed.policy };
          this.notifications = Array.isArray(parsed.notifications) ? parsed.notifications : [];
          this.pushNotification(
            'progress',
            'FastResume 断点索引已恢复',
            `已从磁盘加载 ${this.tasks.length} 个任务与分片位图状态`
          );
          return;
        }
      }
    } catch {
      // Fallback to clean seed state if state file is corrupted
    }

    this.tasks = buildSeedTasks();
    this.notifications = [
      {
        id: `notif-${Date.now()}-1`,
        channel: 'progress',
        title: 'TorrentForegroundService 已启动',
        body: 'librqbit FastResume 持久化会话就绪，已加载 2 个并发传输任务',
        timestamp: new Date().toISOString(),
        read: false,
      },
      {
        id: `notif-${Date.now()}-2`,
        channel: 'complete',
        title: '下载已完成',
        body: 'debian-12.7.0-amd64-netinst-archive 已完成 SHA256 分片校验',
        timestamp: new Date(Date.now() - 120_000).toISOString(),
        read: true,
      },
    ];
    this.persistToDisk();
  }

  private persistToDisk(): void {
    try {
      this.ensureDataDir();
      const payload: PersistedData = {
        tasks: this.tasks,
        policy: this.policy,
        notifications: this.notifications.slice(0, 25),
        savedAt: new Date().toISOString(),
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch {
      // Ignore transient disk write errors
    }
  }

  private pushNotification(channel: NotificationItem['channel'], title: string, body: string): void {
    this.notifications.unshift({
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      channel,
      title,
      body,
      timestamp: new Date().toISOString(),
      read: false,
    });
    if (this.notifications.length > 25) {
      this.notifications = this.notifications.slice(0, 25);
    }
  }

  private isPolicyBlocked(): boolean {
    if (this.policy.wifiOnly && this.policy.simulatedNetwork !== 'wifi') {
      return true;
    }
    if (this.policy.chargingOnly && !this.policy.simulatedCharging) {
      return true;
    }
    return false;
  }

  private reconcileConcurrencyAndPolicy(): void {
    const blocked = this.isPolicyBlocked();
    const sorted = [...this.tasks].sort((a, b) => a.queueOrder - b.queueOrder);
    let activeSlots = 0;

    for (const task of sorted) {
      if (task.status === 'completed' || task.status === 'paused' || task.status === 'error') {
        if (task.status === 'paused') {
          task.downloadBps = 0;
          task.uploadBps = 0;
          task.etaSeconds = null;
          task.peers = [];
        }
        continue;
      }

      if (blocked) {
        if (task.status !== 'policy_paused') {
          task.status = 'policy_paused';
          task.downloadBps = 0;
          task.uploadBps = 0;
          task.etaSeconds = null;
          task.peers = [];
        }
        continue;
      }

      if (activeSlots < this.policy.maxConcurrentDownloads) {
        activeSlots += 1;
        if (task.status === 'queued' || task.status === 'policy_paused' || task.status === 'resolving') {
          task.status = 'downloading';
          if (task.peers.length === 0) {
            task.peers = generatePeers(task.infoHash, 6, true);
          }
        }
      } else {
        task.status = 'queued';
        task.downloadBps = 0;
        task.uploadBps = 0;
        task.etaSeconds = null;
        task.peers = [];
      }
    }
  }

  private startLoop(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick();
    }, 1000);
  }

  private tick(): void {
    this.tickCounter += 1;
    const now = new Date();
    const activeTasks = this.tasks.filter((t) => t.status === 'downloading');
    const globalLimitBps =
      this.policy.globalDownloadLimitKbps > 0 ? this.policy.globalDownloadLimitKbps * 1024 : Infinity;
    const globalUpLimitBps =
      this.policy.globalUploadLimitKbps > 0 ? this.policy.globalUploadLimitKbps * 1024 : Infinity;

    let rawTotalDown = 0;
    const taskRawSpeeds = new Map<string, number>();

    for (const task of activeTasks) {
      const hashJitter = ((task.infoHash.charCodeAt(this.tickCounter % 16) % 25) - 12) / 100;
      const baseSpeed = 9_500_000 * (1 + hashJitter);
      const taskLimitBps =
        task.downloadLimitKbps > 0 ? task.downloadLimitKbps * 1024 : Infinity;
      const effectiveSpeed = Math.max(120_000, Math.min(baseSpeed, taskLimitBps));
      taskRawSpeeds.set(task.id, effectiveSpeed);
      rawTotalDown += effectiveSpeed;
    }

    const scaleFactor =
      rawTotalDown > globalLimitBps && rawTotalDown > 0 ? globalLimitBps / rawTotalDown : 1;

    let completedTriggered = false;

    for (const task of activeTasks) {
      const scaledDownBps = Math.floor((taskRawSpeeds.get(task.id) ?? 0) * scaleFactor);
      const taskUpCap = task.uploadLimitKbps > 0 ? task.uploadLimitKbps * 1024 : Infinity;
      const scaledUpBps = Math.floor(
        Math.min(scaledDownBps * 0.08 + 45_000, taskUpCap, globalUpLimitBps / Math.max(1, activeTasks.length))
      );

      task.downloadBps = scaledDownBps;
      task.uploadBps = scaledUpBps;

      // Distribute downloaded bytes across selected incomplete files
      const selectedIncomplete = task.files.filter((f) => f.selected && f.downloadedBytes < f.sizeBytes);
      let remainingDelta = scaledDownBps;

      for (const file of selectedIncomplete) {
        if (remainingDelta <= 0) break;
        const needed = file.sizeBytes - file.downloadedBytes;
        const chunk = Math.min(needed, remainingDelta);
        file.downloadedBytes += chunk;
        remainingDelta -= chunk;
      }

      task.selectedBytes = task.files.reduce((s, f) => s + (f.selected ? f.sizeBytes : 0), 0);
      task.downloadedBytes = task.files.reduce(
        (s, f) => s + (f.selected ? Math.min(f.downloadedBytes, f.sizeBytes) : 0),
        0
      );
      task.uploadedBytes += scaledUpBps;

      const ratio = task.selectedBytes > 0 ? task.downloadedBytes / task.selectedBytes : 1;
      task.completedPieces = buildBitfield(task.pieceCount, ratio);
      task.fastResumeSavedAt = now.toISOString();

      // Update peer speeds smoothly
      if (task.peers.length === 0) {
        task.peers = generatePeers(task.infoHash, 6, true);
      }
      const peerCount = task.peers.length;
      task.peers.forEach((peer, idx) => {
        const share = (idx + 1) / ((peerCount * (peerCount + 1)) / 2);
        peer.downloadBps = Math.round(scaledDownBps * share);
        peer.uploadBps = Math.round(scaledUpBps * share);
      });

      const remainingBytes = Math.max(0, task.selectedBytes - task.downloadedBytes);
      task.etaSeconds = scaledDownBps > 0 ? Math.ceil(remainingBytes / scaledDownBps) : null;

      if (task.selectedBytes > 0 && task.downloadedBytes >= task.selectedBytes) {
        task.status = 'completed';
        task.downloadBps = 0;
        task.uploadBps = 0;
        task.etaSeconds = 0;
        task.completedAt = now.toISOString();
        task.peers = [];
        task.completedPieces = buildBitfield(task.pieceCount, 1);
        completedTriggered = true;
        this.pushNotification('complete', '下载已完成', `${task.name} 已完成分片校验并落盘`);
      }
    }

    if (completedTriggered) {
      this.reconcileConcurrencyAndPolicy();
    }

    const totalDown = this.tasks.reduce((s, t) => s + t.downloadBps, 0);
    const totalUp = this.tasks.reduce((s, t) => s + t.uploadBps, 0);
    this.speedHistory.push({
      time: formatClock(now),
      downloadBps: totalDown,
      uploadBps: totalUp,
    });
    if (this.speedHistory.length > 45) {
      this.speedHistory = this.speedHistory.slice(-45);
    }

    if (this.tickCounter % 3 === 0 || completedTriggered) {
      this.persistToDisk();
    }
  }

  public getSnapshot(): EngineStateSnapshot {
    const totalDownloadBps = this.tasks.reduce((s, t) => s + t.downloadBps, 0);
    const totalUploadBps = this.tasks.reduce((s, t) => s + t.uploadBps, 0);
    const activeCount = this.tasks.filter((t) => t.status === 'downloading').length;
    const queuedCount = this.tasks.filter((t) => t.status === 'queued').length;

    return {
      tasks: [...this.tasks].sort((a, b) => a.queueOrder - b.queueOrder),
      policy: { ...this.policy },
      totalDownloadBps,
      totalUploadBps,
      activeCount,
      queuedCount,
      fastResumeCount: this.policy.fastResumeEnabled ? this.tasks.length : 0,
      speedHistory: [...this.speedHistory],
      notifications: [...this.notifications],
    };
  }

  public addMagnet(input: {
    magnetUri: string;
    selectedFileIndices?: number[];
    downloadLimitKbps?: number;
    startPaused?: boolean;
  }): { task?: TorrentTask; error?: string } {
    const parsed = parseMagnetUri(input.magnetUri);
    if (!parsed.valid) {
      return { error: parsed.error || '磁力链接格式无效' };
    }

    const existing = this.tasks.find((t) => t.infoHash === parsed.infoHash);
    if (existing) {
      return { error: `任务 "${existing.name}" 已存在于队列中（InfoHash 重复）` };
    }

    const selectedSet =
      Array.isArray(input.selectedFileIndices) && input.selectedFileIndices.length > 0
        ? new Set(input.selectedFileIndices)
        : null;

    const files = parsed.files.map((f) => ({
      ...f,
      selected: selectedSet ? selectedSet.has(f.index) : true,
    }));

    const selectedBytes = files.reduce((s, f) => s + (f.selected ? f.sizeBytes : 0), 0);
    const maxOrder = this.tasks.reduce((m, t) => Math.max(m, t.queueOrder), 0);
    const now = new Date();
    const pieceCount = 64;

    const newTask: TorrentTask = {
      id: `task-${parsed.infoHash.slice(0, 8)}-${Date.now().toString(36)}`,
      infoHash: parsed.infoHash,
      name: parsed.name,
      magnetUri: parsed.magnetUri,
      status: input.startPaused ? 'paused' : 'queued',
      totalBytes: parsed.totalBytes,
      selectedBytes,
      downloadedBytes: 0,
      uploadedBytes: 0,
      downloadBps: 0,
      uploadBps: 0,
      etaSeconds: null,
      downloadLimitKbps: input.downloadLimitKbps ?? 0,
      uploadLimitKbps: 0,
      queueOrder: maxOrder + 1,
      pieceCount,
      pieceSizeBytes: Math.max(262_144, Math.floor(parsed.totalBytes / pieceCount)),
      completedPieces: buildBitfield(pieceCount, 0),
      fastResumeSavedAt: now.toISOString(),
      addedAt: now.toISOString(),
      completedAt: null,
      files,
      peers: [],
      trackers: parsed.trackers.map((url) => ({
        url,
        status: 'working',
        peers: 8,
        lastAnnounce: formatClock(now),
      })),
      errorMessage: null,
    };

    this.tasks.push(newTask);
    this.reconcileConcurrencyAndPolicy();
    this.pushNotification('progress', '已添加磁力任务', `${newTask.name} 已进入 librqbit 调度队列`);
    this.persistToDisk();

    return { task: newTask };
  }

  public pauseTask(id: string): boolean {
    const task = this.tasks.find((t) => t.id === id);
    if (!task || task.status === 'completed') return false;
    task.status = 'paused';
    task.downloadBps = 0;
    task.uploadBps = 0;
    task.etaSeconds = null;
    task.peers = [];
    this.reconcileConcurrencyAndPolicy();
    this.persistToDisk();
    return true;
  }

  public resumeTask(id: string): boolean {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return false;
    if (task.status === 'completed') {
      return false;
    }
    task.status = 'queued';
    this.reconcileConcurrencyAndPolicy();
    this.persistToDisk();
    return true;
  }

  public pauseAll(): void {
    for (const task of this.tasks) {
      if (task.status === 'downloading' || task.status === 'queued' || task.status === 'policy_paused') {
        task.status = 'paused';
        task.downloadBps = 0;
        task.uploadBps = 0;
        task.etaSeconds = null;
        task.peers = [];
      }
    }
    this.pushNotification('progress', '前台服务通知操作', '已通过系统通知快捷操作暂停全部任务');
    this.persistToDisk();
  }

  public resumeAll(): void {
    for (const task of this.tasks) {
      if (task.status === 'paused' || task.status === 'policy_paused') {
        task.status = 'queued';
      }
    }
    this.reconcileConcurrencyAndPolicy();
    this.pushNotification('progress', '前台服务通知操作', '已恢复并发下载队列');
    this.persistToDisk();
  }

  public promoteTask(id: string): boolean {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return false;
    const minOrder = this.tasks.reduce((m, t) => Math.min(m, t.queueOrder), 1);
    task.queueOrder = minOrder - 1;
    if (task.status === 'paused') {
      task.status = 'queued';
    }
    this.reconcileConcurrencyAndPolicy();
    this.persistToDisk();
    return true;
  }

  public updateFiles(
    id: string,
    updates: Array<{ index: number; selected: boolean; priority?: FilePriority }>
  ): TorrentTask | null {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;

    for (const upd of updates) {
      const file = task.files.find((f) => f.index === upd.index);
      if (file) {
        file.selected = upd.selected;
        if (upd.priority) {
          file.priority = upd.priority;
        }
      }
    }

    task.selectedBytes = task.files.reduce((s, f) => s + (f.selected ? f.sizeBytes : 0), 0);
    task.downloadedBytes = task.files.reduce(
      (s, f) => s + (f.selected ? Math.min(f.downloadedBytes, f.sizeBytes) : 0),
      0
    );

    if (task.selectedBytes > 0 && task.downloadedBytes >= task.selectedBytes) {
      task.status = 'completed';
      task.downloadBps = 0;
      task.uploadBps = 0;
      task.etaSeconds = 0;
    } else if (task.status === 'completed' && task.downloadedBytes < task.selectedBytes) {
      task.status = 'queued';
      task.completedAt = null;
    }

    this.reconcileConcurrencyAndPolicy();
    this.persistToDisk();
    return task;
  }

  public updateTaskLimits(id: string, downloadLimitKbps: number, uploadLimitKbps: number): TorrentTask | null {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return null;
    task.downloadLimitKbps = Math.max(0, Math.round(downloadLimitKbps));
    task.uploadLimitKbps = Math.max(0, Math.round(uploadLimitKbps));
    this.persistToDisk();
    return task;
  }

  public removeTask(id: string): boolean {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.tasks.splice(idx, 1);
    this.reconcileConcurrencyAndPolicy();
    this.persistToDisk();
    return true;
  }

  public updatePolicy(partial: Partial<EnginePolicy>): EnginePolicy {
    const prevBlocked = this.isPolicyBlocked();
    this.policy = {
      ...this.policy,
      ...partial,
      maxConcurrentDownloads: Math.max(1, Math.min(6, Number(partial.maxConcurrentDownloads ?? this.policy.maxConcurrentDownloads))),
      globalDownloadLimitKbps: Math.max(0, Number(partial.globalDownloadLimitKbps ?? this.policy.globalDownloadLimitKbps)),
      globalUploadLimitKbps: Math.max(0, Number(partial.globalUploadLimitKbps ?? this.policy.globalUploadLimitKbps)),
    };
    this.reconcileConcurrencyAndPolicy();
    const nowBlocked = this.isPolicyBlocked();

    if (!prevBlocked && nowBlocked) {
      this.pushNotification(
        'policy',
        '网络/电源策略触发挂起',
        this.policy.wifiOnly && this.policy.simulatedNetwork !== 'wifi'
          ? '已切换至移动蜂窝网络，librqbit 活跃任务已安全挂起并保存断点'
          : '未连接充电器，已按省电策略暂停传输'
      );
    } else if (prevBlocked && !nowBlocked) {
      this.pushNotification(
        'policy',
        '策略条件满足，自动恢复下载',
        '已重新接入符合策略的网络与电源环境，正在继续传输'
      );
    }

    this.persistToDisk();
    return { ...this.policy };
  }

  public markAllNotificationsRead(): void {
    this.notifications = this.notifications.map((n) => ({ ...n, read: true }));
    this.persistToDisk();
  }
}
