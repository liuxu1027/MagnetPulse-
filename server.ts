import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import JSZip from 'jszip';
import path from 'path';
import type { NativeFileNode } from './src/types/torrent.ts';
import { MagnetPulseEngine } from './server/engine.ts';
import { parseMagnetUri } from './server/magnetParser.ts';

dotenv.config();

const PORT = 3000;
const NATIVE_DIR = path.resolve(process.cwd(), 'native');

function buildNativeTree(dirPath: string, relBase = ''): NativeFileNode[] {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  return sorted.map((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return {
        name: entry.name,
        path: relPath,
        type: 'directory',
        children: buildNativeTree(fullPath, relPath),
      };
    }
    const stat = fs.statSync(fullPath);
    return {
      name: entry.name,
      path: relPath,
      type: 'file',
      size: stat.size,
    };
  });
}

function appendDirToZip(zip: JSZip, dirPath: string, zipBase = ''): void {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const rel = zipBase ? `${zipBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      appendDirToZip(zip, fullPath, rel);
    } else {
      zip.file(rel, fs.readFileSync(fullPath));
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const engine = new MagnetPulseEngine();

  // API Routes
  app.get('/api/state', (_req, res) => {
    res.json(engine.getSnapshot());
  });

  app.post('/api/magnet/parse', (req, res) => {
    const magnetUri = String(req.body?.magnetUri ?? '');
    const parsed = parseMagnetUri(magnetUri);
    res.status(parsed.valid ? 200 : 400).json(parsed);
  });

  app.post('/api/torrents', (req, res) => {
    const { magnetUri, selectedFileIndices, downloadLimitKbps, startPaused } = req.body ?? {};
    const result = engine.addMagnet({
      magnetUri: String(magnetUri ?? ''),
      selectedFileIndices: Array.isArray(selectedFileIndices) ? selectedFileIndices : undefined,
      downloadLimitKbps: typeof downloadLimitKbps === 'number' ? downloadLimitKbps : 0,
      startPaused: Boolean(startPaused),
    });

    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json({ task: result.task, snapshot: engine.getSnapshot() });
  });

  app.post('/api/torrents/:id/pause', (req, res) => {
    const ok = engine.pauseTask(req.params.id);
    if (!ok) {
      res.status(404).json({ error: '任务不存在或无法暂停' });
      return;
    }
    res.json(engine.getSnapshot());
  });

  app.post('/api/torrents/:id/resume', (req, res) => {
    const ok = engine.resumeTask(req.params.id);
    if (!ok) {
      res.status(404).json({ error: '任务不存在或已下载完成' });
      return;
    }
    res.json(engine.getSnapshot());
  });

  app.post('/api/torrents/:id/promote', (req, res) => {
    const ok = engine.promoteTask(req.params.id);
    if (!ok) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }
    res.json(engine.getSnapshot());
  });

  app.put('/api/torrents/:id/files', (req, res) => {
    const updates = Array.isArray(req.body?.files) ? req.body.files : [];
    const task = engine.updateFiles(req.params.id, updates);
    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }
    res.json({ task, snapshot: engine.getSnapshot() });
  });

  app.put('/api/torrents/:id/limits', (req, res) => {
    const down = Number(req.body?.downloadLimitKbps ?? 0);
    const up = Number(req.body?.uploadLimitKbps ?? 0);
    const task = engine.updateTaskLimits(req.params.id, down, up);
    if (!task) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }
    res.json({ task, snapshot: engine.getSnapshot() });
  });

  app.delete('/api/torrents/:id', (req, res) => {
    const ok = engine.removeTask(req.params.id);
    if (!ok) {
      res.status(404).json({ error: '任务不存在' });
      return;
    }
    res.json(engine.getSnapshot());
  });

  app.put('/api/policy', (req, res) => {
    const policy = engine.updatePolicy(req.body ?? {});
    res.json({ policy, snapshot: engine.getSnapshot() });
  });

  app.post('/api/notifications/action', (req, res) => {
    const { action, taskId } = req.body ?? {};
    if (action === 'pause_all') {
      engine.pauseAll();
    } else if (action === 'resume_all') {
      engine.resumeAll();
    } else if (action === 'pause_task' && typeof taskId === 'string') {
      engine.pauseTask(taskId);
    } else if (action === 'resume_task' && typeof taskId === 'string') {
      engine.resumeTask(taskId);
    } else if (action === 'mark_read') {
      engine.markAllNotificationsRead();
    }
    res.json(engine.getSnapshot());
  });

  // Native Rust + Android source inspection & ZIP export
  app.get('/api/native-project/tree', (_req, res) => {
    res.json({ tree: buildNativeTree(NATIVE_DIR) });
  });

  app.get('/api/native-project/file', (req, res) => {
    const relPath = String(req.query.path ?? '');
    const resolved = path.resolve(NATIVE_DIR, relPath);
    if (!resolved.startsWith(NATIVE_DIR) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      res.status(404).json({ error: '源码文件不存在' });
      return;
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    res.json({ path: relPath, content });
  });

  app.get('/api/native-project/download', async (_req, res) => {
    try {
      const zip = new JSZip();
      appendDirToZip(zip, NATIVE_DIR, 'MagnetPulse-Native');
      const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="MagnetPulse-Native-Android-librqbit.zip"');
      res.send(buffer);
    } catch {
      res.status(500).json({ error: '打包原生工程失败' });
    }
  });

  // Optional live local rqbit HTTP bridge test
  app.post('/api/rqbit-bridge/test', async (req, res) => {
    const rawUrl = String(req.body?.url ?? '').trim().replace(/\/+$/, '');
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
      res.status(400).json({ ok: false, error: '节点地址必须以 http:// 或 https:// 开头' });
      return;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${rawUrl}/torrents`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        res.status(502).json({ ok: false, error: `目标 rqbit 节点返回 HTTP ${response.status}` });
        return;
      }
      const data = await response.json();
      res.json({ ok: true, torrentsCount: Array.isArray(data?.torrents) ? data.torrents.length : 0 });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: err instanceof Error ? `无法连接节点：${err.message}` : '无法连接目标 rqbit HTTP 服务',
      });
    }
  });

  // Vite middleware in dev, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MagnetPulse server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
