import type { ParsedMagnetPreview, TorrentFileItem } from '../src/types/torrent.ts';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32ToHex(base32: string): string {
  const clean = base32.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const ch of clean) {
    const val = BASE32_ALPHABET.indexOf(ch);
    if (val === -1) return '';
    bits += val.toString(2).padStart(5, '0');
  }
  let hex = '';
  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex.slice(0, 40).toLowerCase();
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const KNOWN_OPEN_TORRENTS: Record<
  string,
  { name: string; files: Array<{ path: string; sizeBytes: number }> }
> = {
  '2c6b6858d61da9543d4231a71db4b1c9264b0685': {
    name: 'ubuntu-24.04.1-desktop-amd64.iso',
    files: [
      { path: 'ubuntu-24.04.1-desktop-amd64.iso', sizeBytes: 6_148_259_840 },
      { path: 'SHA256SUMS', sizeBytes: 1_420 },
      { path: 'SHA256SUMS.gpg', sizeBytes: 833 },
    ],
  },
  '7e4c19a2f08d6c4b1130e8b8f91544d3802a9e12': {
    name: 'Blender-4.3-Open-Movie-Benchmark-Bundle',
    files: [
      { path: 'scenes/classroom_cycles.blend', sizeBytes: 428_400_120 },
      { path: 'scenes/barbershop_interior.blend', sizeBytes: 812_930_440 },
      { path: 'textures/4k_pbr_pack.tar.zst', sizeBytes: 1_240_550_000 },
      { path: 'renders/reference_4k.exr', sizeBytes: 184_210_000 },
      { path: 'README_BENCHMARK.md', sizeBytes: 14_820 },
    ],
  },
  'a8d41f3c92b0e4471190c3b208f75e6a4b12d901': {
    name: 'debian-12.7.0-amd64-netinst-archive',
    files: [
      { path: 'debian-12.7.0-amd64-netinst.iso', sizeBytes: 662_700_032 },
      { path: 'debian-mac-12.7.0-amd64-netinst.iso', sizeBytes: 664_120_110 },
      { path: 'SHA512SUMS', sizeBytes: 3_190 },
    ],
  },
  'f491a7c82b039d11e5840f62c7b194d38a62e077': {
    name: 'archlinux-2026.11.01-x86_64-bundle',
    files: [
      { path: 'archlinux-2026.11.01-x86_64.iso', sizeBytes: 1_184_890_880 },
      { path: 'archlinux-bootstrap-x86_64.tar.zst', sizeBytes: 214_620_000 },
      { path: 'b2sums.txt', sizeBytes: 512 },
    ],
  },
};

export function parseMagnetUri(rawUri: string): ParsedMagnetPreview {
  const trimmed = rawUri.trim();
  if (!trimmed.startsWith('magnet:?')) {
    return {
      valid: false,
      infoHash: '',
      name: '',
      magnetUri: trimmed,
      totalBytes: 0,
      trackers: [],
      files: [],
      error: '无效的磁力链接：必须以 magnet:? 开头',
    };
  }

  const query = trimmed.slice('magnet:?'.length);
  const params = new URLSearchParams(query);
  const xts = params.getAll('xt');

  let infoHash = '';
  for (const xt of xts) {
    const match = xt.match(/^urn:btih:([a-zA-Z0-9]+)$/i);
    if (match) {
      const token = match[1];
      if (/^[a-fA-F0-9]{40}$/.test(token)) {
        infoHash = token.toLowerCase();
        break;
      }
      if (/^[a-zA-Z2-7]{32}$/.test(token)) {
        infoHash = base32ToHex(token);
        break;
      }
    }
  }

  if (!infoHash || infoHash.length !== 40) {
    return {
      valid: false,
      infoHash: '',
      name: '',
      magnetUri: trimmed,
      totalBytes: 0,
      trackers: [],
      files: [],
      error: '未找到有效的 40 位十六进制或 32 位 Base32 InfoHash (xt=urn:btih:...)',
    };
  }

  const dn = params.get('dn');
  const xlRaw = params.get('xl');
  const trackers = params.getAll('tr').filter(Boolean);
  const defaultTrackers =
    trackers.length > 0
      ? trackers
      : [
          'udp://tracker.opentrackr.org:1337/announce',
          'udp://open.stealth.si:80/announce',
          'https://torrent.ubuntu.com/announce',
        ];

  const known = KNOWN_OPEN_TORRENTS[infoHash];
  const displayName =
    dn?.trim() || known?.name || `magnet-payload-${infoHash.slice(0, 8)}`;

  let files: TorrentFileItem[];
  if (known) {
    files = known.files.map((f, idx) => ({
      index: idx,
      path: f.path,
      sizeBytes: f.sizeBytes,
      downloadedBytes: 0,
      selected: true,
      priority: idx === 0 ? 'high' : 'normal',
    }));
  } else {
    const seed = hashSeed(infoHash);
    const totalFromXl = xlRaw && Number(xlRaw) > 0 ? Number(xlRaw) : ((seed % 1800) + 320) * 1024 * 1024;
    const primarySize = Math.floor(totalFromXl * 0.78);
    const secondarySize = Math.floor(totalFromXl * 0.19);
    const checksumSize = Math.max(1024, totalFromXl - primarySize - secondarySize);
    files = [
      {
        index: 0,
        path: `${displayName}/payload.tar.zst`,
        sizeBytes: primarySize,
        downloadedBytes: 0,
        selected: true,
        priority: 'high',
      },
      {
        index: 1,
        path: `${displayName}/assets-pack.bin`,
        sizeBytes: secondarySize,
        downloadedBytes: 0,
        selected: true,
        priority: 'normal',
      },
      {
        index: 2,
        path: `${displayName}/SHA256SUMS.txt`,
        sizeBytes: checksumSize,
        downloadedBytes: 0,
        selected: true,
        priority: 'low',
      },
    ];
  }

  const totalBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

  return {
    valid: true,
    infoHash,
    name: displayName,
    magnetUri: trimmed,
    totalBytes,
    trackers: defaultTrackers,
    files,
  };
}
