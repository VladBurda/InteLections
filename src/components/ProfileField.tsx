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
    <label className="grid self-start gap-1">
      <span className="text-sm text-neutral-600">{label}</span>
      {editable ? (
        <input
          type={type}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={e => onChange?.(e.target.value)}
          className="min-h-[54px] rounded-[24px] border border-neutral-200 bg-white px-4 py-3 leading-6"
        />
      ) : (
        <div className="flex min-h-[54px] items-center rounded-[24px] border border-neutral-200 bg-white px-4 py-3 leading-6 text-neutral-800">{value || '-'}</div>
      )}
    </label>
  );
}

