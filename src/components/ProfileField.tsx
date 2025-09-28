export default function ProfileField({
  label, value, editable, onChange, type = 'text', placeholder,
}: {
  label: string;
  value?: string;
  editable?: boolean;
  onChange?: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm text-neutral-600">{label}</span>
      {editable ? (
        <input
          type={type}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={e => onChange?.(e.target.value)}
          className="rounded-lg border px-3 py-2"
        />
      ) : (
        <div className="rounded-lg border px-3 py-2 bg-white">{value || '—'}</div>
      )}
    </label>
  );
}
