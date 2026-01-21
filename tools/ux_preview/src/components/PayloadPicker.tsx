import type { FormEvent } from 'react';

type PayloadPickerProps = {
  selected: string;
  onSelect: (value: string) => void;
  onLoad: () => void;
  onClear: () => void;
  onCopy: () => void;
};

export function PayloadPicker({
  selected,
  onSelect,
  onLoad,
  onClear,
  onCopy,
}: PayloadPickerProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onLoad();
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3>Examples</h3>
      <label className="label">
        Example payload
        <select
          value={selected}
          onChange={(event) => onSelect(event.target.value)}
        >
          <option value="ready">READY</option>
          <option value="warn">WARN</option>
          <option value="block">BLOCK</option>
        </select>
      </label>
      <div className="button-row">
        <button type="submit">Load example</button>
        <button type="button" onClick={onClear} className="secondary">
          Clear
        </button>
        <button type="button" onClick={onCopy} className="secondary">
          Copy normalized JSON
        </button>
      </div>
    </form>
  );
}
