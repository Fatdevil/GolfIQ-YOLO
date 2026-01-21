import type { ChangeEvent } from 'react';

type PayloadInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function PayloadInput({ value, onChange }: PayloadInputProps) {
  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="card">
      <h3>Payload JSON</h3>
      <textarea
        className="payload-input"
        value={value}
        onChange={handleChange}
        placeholder="Paste ux_payload_v1 or full API response JSON here."
      />
    </div>
  );
}
