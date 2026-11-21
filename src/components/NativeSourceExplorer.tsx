import { useEffect, useState } from 'react';
import { Check, Copy, Download, FileCode2, Folder, FolderOpen } from 'lucide-react';
import type { NativeFileNode } from '../types/torrent';

function FileTreeItem({
  node,
  selectedPath,
  onSelectFile,
  depth = 0,
}: {
  node: NativeFileNode;
  selectedPath: string;
  onSelectFile: (path: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);

  if (node.type === 'directory') {
    return (
      <div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ paddingLeft: `${depth * 14 + 10}px` }}
          className="flex w-full items-center gap-2 py-1.5 pr-2 text-left text-xs text-[#C4C6D0] hover:bg-white/[0.04] rounded-lg transition-colors"
        >
          {expanded ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#A8C7FA]" aria-hidden="true" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-[#9AA0AC]" aria-hidden="true" />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {expanded &&
          node.children?.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  const active = selectedPath === node.path;
  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.path)}
      style={{ paddingLeft: `${depth * 14 + 10}px` }}
      className={`flex w-full items-center gap-2 py-1.5 pr-2 text-left text-xs rounded-lg transition-colors ${
        active
          ? 'bg-[#A8C7FA]/15 text-[#A8C7FA]'
          : 'text-[#9AA0AC] hover:bg-white/[0.04] hover:text-[#E3E2E6]'
      }`}
    >
      <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate font-mono-tabular">{node.name}</span>
    </button>
  );
}

export function NativeSourceExplorer() {
  const [tree, setTree] = useState<NativeFileNode[]>([]);
  const [selectedPath, setSelectedPath] = useState('rust-core/src/lib.rs');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/native-project/tree')
      .then((r) => r.json())
      .then((data) => {
        setTree(Array.isArray(data.tree) ? data.tree : []);
      })
      .catch(() => setTree([]));
  }, []);

  useEffect(() => {
    if (!selectedPath) return;
    setLoading(true);
    fetch(`/api/native-project/file?path=${encodeURIComponent(selectedPath)}`)
      .then((r) => r.json())
      .then((data) => {
        setContent(typeof data.content === 'string' ? data.content : '');
      })
      .catch(() => setContent('// 无法加载源码文件'))
      .finally(() => setLoading(false));
  }, [selectedPath]);

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#171A23] px-6 py-5">
        <div>
          <h2 className="font-display text-base font-semibold text-[#E3E2E6]">
            Rust (librqbit + UniFFI) 与原生 Android (Jetpack Compose) 工程源码
          </h2>
          <p className="mt-1 text-xs text-[#9AA0AC]">
            包含完整的 <span className="font-mono-tabular text-[#C4C6D0]">Cargo.toml</span>、UniFFI UDL 绑定接口、<span className="font-mono-tabular text-[#C4C6D0]">TorrentForegroundService.kt</span> 前台通知服务及 Gradle 配置，可直接下载并用 cargo-ndk + Android Studio 编译为 APK。
          </p>
        </div>

        <a
          href="/api/native-project/download"
          download="MagnetPulse-Native-Android-librqbit.zip"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[#A8C7FA] px-4 text-sm font-medium text-[#062E6F] hover:bg-[#BED6FC] whitespace-nowrap transition-colors"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          <span>导出完整工程 (.zip)</span>
        </a>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Tree */}
        <aside className="lg:col-span-4 rounded-2xl border border-white/[0.08] bg-[#171A23] p-3 max-h-[620px] overflow-y-auto">
          <div className="px-2 pb-2 mb-2 border-b border-white/[0.06] text-xs font-medium text-[#9AA0AC]">
            工程目录结构
          </div>
          {tree.map((node) => (
            <FileTreeItem
              key={node.path}
              node={node}
              selectedPath={selectedPath}
              onSelectFile={setSelectedPath}
            />
          ))}
        </aside>

        {/* Right Code Viewer */}
        <div className="lg:col-span-8 rounded-2xl border border-white/[0.08] bg-[#171A23] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
            <span className="truncate text-xs font-mono-tabular text-[#E3E2E6]">{selectedPath}</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#1E222E] px-2.5 text-xs text-[#C4C6D0] hover:text-[#E3E2E6] whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-[#22C55E]" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? '已复制' : '复制代码'}</span>
            </button>
          </div>
          <pre className="flex-1 overflow-auto bg-[#0F1117] p-4 text-xs leading-relaxed font-mono-tabular text-[#D6DAE3] max-h-[565px]">
            {loading ? '正在读取文件...' : content}
          </pre>
        </div>
      </div>
    </div>
  );
}
