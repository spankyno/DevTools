import type { OptionDef, Opts, OptionValue } from '../tools/types';

type Props = { options: OptionDef[]; values: Opts; onChange: (id: string, v: OptionValue) => void };

export default function OptionsBar({ options, values, onChange }: Props) {
  return (
    <div className="options-bar">
      {options.map((o) => (
        <label key={o.id} className={'opt' + (o.type === 'checkbox' ? ' opt-check' : '')}>
          {o.type === 'checkbox' ? (
            <>
              <input type="checkbox" checked={Boolean(values[o.id])} onChange={(e) => onChange(o.id, e.target.checked)} />
              <span>{o.label}</span>
            </>
          ) : (
            <>
              <span>{o.label}</span>
              {o.type === 'select' ? (
                <select value={String(values[o.id])} onChange={(e) => onChange(o.id, e.target.value)}>
                  {o.choices?.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              ) : o.type === 'number' ? (
                <input type="number" min={o.min} max={o.max} value={String(values[o.id])}
                  onChange={(e) => onChange(o.id, e.target.value === '' ? '' : Number(e.target.value))} />
              ) : (
                <input type="text" value={String(values[o.id])} onChange={(e) => onChange(o.id, e.target.value)} spellCheck={false} />
              )}
            </>
          )}
        </label>
      ))}
    </div>
  );
}
