import { Check, Monitor, Moon, Sun } from 'lucide-react';
import type { Preferences } from './mygo';
import { palettes } from './appearance';

export function SettingsPanel({
  value,
  saving,
  onChange,
  onDevelopment,
}: {
  value: Preferences;
  saving: boolean;
  onChange: (p: Preferences) => void;
  onDevelopment?: () => void;
}) {
  return (
    <div className="settings-content">
      <h3>主题色</h3>
      <div className="palette-options">
        {palettes.map(({ id, name }) => (
          <button
            type="button"
            key={id}
            className={`palette-card ${value.palette === id ? 'chosen' : ''}`}
            aria-pressed={value.palette === id}
            disabled={saving}
            onClick={() => onChange({ ...value, palette: id })}
          >
            <span className={`theme-preview ${id}`} aria-hidden="true">
              <i />
              <span>
                <b />
                <b />
                <b />
              </span>
            </span>
            <strong>
              {name} {value.palette === id && <Check size={15} />}
            </strong>
          </button>
        ))}
      </div>
      <h3>外观</h3>
      <div className="appearance-options">
        {(
          [
            ['light', '浅色', Sun],
            ['dark', '深色', Moon],
            ['system', '跟随系统', Monitor],
          ] as const
        ).map(([id, name, Icon]) => (
          <button
            type="button"
            className={`button ${value.appearance === id ? 'selected' : ''}`}
            key={id}
            aria-pressed={value.appearance === id}
            disabled={saving}
            onClick={() => onChange({ ...value, appearance: id })}
          >
            <Icon size={16} />
            {name}
          </button>
        ))}
      </div>
      <div className="setting-size">
        <label htmlFor="code-size">代码字号</label>
        <select
          id="code-size"
          value={value.codeSize}
          disabled={saving}
          onChange={(e) => onChange({ ...value, codeSize: Number(e.target.value) })}
        >
          {[12, 14].map((n) => (
            <option key={n} value={n}>
              {n} px
            </option>
          ))}
        </select>
      </div>
      {onDevelopment && (
        <div className="setting-size">
          <label>开发环境与快捷命令</label>
          <button className="button compact" onClick={onDevelopment}>
            配置开发环境
          </button>
        </div>
      )}
      <div className="settings-footnote">
        {saving ? '正在保存…' : '已自动保存'}
        <span>SakuraGit 0.10.1 / MyGo</span>
      </div>
    </div>
  );
}
