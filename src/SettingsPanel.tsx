import { Check, Monitor, Moon, Sun } from 'lucide-react';
import type { Preferences } from './mygo';
import { palettes } from './appearance';

export function SettingsPanel({
  value,
  saving,
  onChange,
}: {
  value: Preferences;
  saving: boolean;
  onChange: (p: Preferences) => void;
}) {
  return (
    <div className="settings-content">
      <p className="modal-description">
        把工作区调成你喜欢的样子。外观设置保存在本机，不修改任何 Git 配置。
      </p>
      <h3>
        主题色 <span>PALETTE</span>
      </h3>
      <div className="palette-options">
        {palettes.map(({ id, name, description }) => (
          <button
            type="button"
            key={id}
            className={`palette-card ${value.palette === id ? 'chosen' : ''}`}
            aria-pressed={value.palette === id}
            disabled={saving}
            onClick={() => onChange({ ...value, palette: id })}
          >
            <span className={`palette-sample ${id}`}>
              <i />
              <i />
              <i />
            </span>
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
            <small>{description}</small>
          </button>
        ))}
      </div>
      <p className="theme-note">
        4 款主题 × 浅色 / 深色 / 跟随系统 · 同步应用于工作台、Diff 与内置终端。
      </p>
      <h3>
        外观 <span>APPEARANCE</span>
      </h3>
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
        <label htmlFor="code-size">
          Diff 字号 <small>只调整代码阅读区域</small>
        </label>
        <select
          id="code-size"
          value={value.codeSize}
          disabled={saving}
          onChange={(e) => onChange({ ...value, codeSize: Number(e.target.value) })}
        >
          {[11, 12, 13, 14, 15, 16].map((n) => (
            <option key={n} value={n}>
              {n} px
            </option>
          ))}
        </select>
      </div>
      <div className="settings-footnote">
        {saving ? '正在保存…' : '自动保存 · 下次启动继续使用'}
        <span>SakuraGit 0.7.0 / MyGo</span>
      </div>
    </div>
  );
}
