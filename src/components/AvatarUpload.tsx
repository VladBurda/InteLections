import { useRef } from 'react';

export default function AvatarUpload({
  url, onChange,
}: { url?: string; onChange?: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <div className="size-20 rounded-full bg-neutral-300 overflow-hidden">
        {url ? <img src={url} className="w-full h-full object-cover" /> : null}
      </div>
      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 rounded-lg border hover:bg-neutral-50"
                onClick={() => ref.current?.click()}>
          Change
        </button>
        <input ref={ref} type="file" accept="image/*" className="hidden"
               onChange={e => e.target.files && onChange?.(e.target.files[0])}/>
      </div>
    </div>
  );
}
