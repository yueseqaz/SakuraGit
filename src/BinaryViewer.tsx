import type { BinaryPreview } from './mygo';

export function BinaryViewer({
  preview,
  loading,
  onPage,
}: {
  preview: BinaryPreview;
  loading: boolean;
  onPage: (offset: number) => void;
}) {
  const data = preview.image ? '' : atob(preview.data);
  const rows: string[] = [];
  if (!preview.image)
    for (let i = 0; i < data.length; i += 16) {
      const chunk = data.slice(i, i + 16);
      const hex = Array.from(chunk, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(chunk, (c) =>
        c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126 ? c : '.',
      ).join('');
      rows.push(
        `${(preview.offset + i).toString(16).padStart(12, '0')}  ${hex.padEnd(47)}  ${ascii}`,
      );
    }
  return (
    <section className="binary-viewer" aria-label="二进制只读预览">
      <header>
        <span>
          {preview.size.toLocaleString()} 字节 / {preview.image ? preview.mime : '十六进制 / ASCII'}{' '}
          / 只读
        </span>
        {!preview.image && (
          <div className="binary-pagination">
            <button
              className="button compact"
              disabled={loading || preview.offset === 0}
              onClick={() => onPage(preview.offset - 4096)}
            >
              上一页
            </button>
            <span>
              {Math.floor(preview.offset / 4096) + 1} /{' '}
              {Math.max(1, Math.ceil(preview.size / 4096))}
            </span>
            <button
              className="button compact"
              disabled={loading || !preview.more}
              onClick={() => onPage(preview.offset + 4096)}
            >
              下一页
            </button>
          </div>
        )}
      </header>
      {preview.image ? (
        <div className="binary-image">
          <img src={`data:${preview.mime};base64,${preview.data}`} alt={preview.path} />
        </div>
      ) : (
        <pre tabIndex={0}>{rows.join('\n') || '空文件'}</pre>
      )}
    </section>
  );
}
