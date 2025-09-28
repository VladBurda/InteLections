import { useMemo, useState } from 'react';
import { CURRENT_USER } from '../data/current-user';
import type { User } from '../types/user';
import AvatarUpload from '../components/AvatarUpload';
import ProfileField from '../components/ProfileField';

export default function AccountPage() {
  const [user, setUser] = useState<User>(CURRENT_USER);
  const [edit, setEdit] = useState(false);

  const fullName = useMemo(() => `${user.firstName} ${user.lastName}`, [user]);

  function save() {
    // TODO: wywołanie API (PUT /me)
    setEdit(false);
  }
  function cancel() {
    setUser(CURRENT_USER);
    setEdit(false);
  }

  return (
    <section className="space-y-6">
      {/* Header sekcji */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Profile</h2>
        {!edit ? (
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg border hover:bg-neutral-50" onClick={() => setEdit(true)}>Edit</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg border hover:bg-neutral-50" onClick={cancel}>Cancel</button>
            <button className="px-3 py-1.5 rounded-lg bg-black text-white" onClick={save}>Save</button>
          </div>
        )}
      </div>

      {/* Karta główna */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 grid gap-6">
        <div className="flex flex-wrap items-center gap-6">
          <AvatarUpload
            url={user.avatarUrl}
            onChange={(file) => {
              const url = URL.createObjectURL(file);
              setUser(u => ({ ...u, avatarUrl: url }));
            }}
          />
          <div className="min-w-[220px]">
            <div className="text-xl font-semibold">{fullName}</div>
            <div className="text-sm text-neutral-600">{user.role}</div>
          </div>
        </div>

        {/* General info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ProfileField label="First name" value={user.firstName} editable={edit}
                        onChange={v => setUser(u => ({ ...u, firstName: v }))}/>
          <ProfileField label="Last name" value={user.lastName} editable={edit}
                        onChange={v => setUser(u => ({ ...u, lastName: v }))}/>
          <ProfileField label="Email" value={user.email} editable={false}/>
          <ProfileField label="Role" value={user.role} editable={false}/>
          <ProfileField label="Location" value={user.location} editable={edit}
                        onChange={v => setUser(u => ({ ...u, location: v }))}/>
          <ProfileField label="Birthday" value={user.birthday} editable={edit} type="date"
                        onChange={v => setUser(u => ({ ...u, birthday: v }))}/>
          <label className="md:col-span-2 grid gap-1">
            <span className="text-sm text-neutral-600">Bio</span>
            {edit ? (
              <textarea
                value={user.bio ?? ''}
                onChange={e => setUser(u => ({ ...u, bio: e.target.value }))}
                className="rounded-lg border px-3 py-2 min-h-[96px]"
                placeholder="Tell others about yourself..."
              />
            ) : (
              <div className="rounded-lg border px-3 py-2 bg-white min-h-[48px]">{user.bio || '—'}</div>
            )}
          </label>
        </div>
      </div>

      {/* Dodatkowa sekcja (placeholder pod przyszłe pola) */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 grid gap-4">
        <h3 className="text-lg font-semibold">Additional information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ProfileField label="Website" value={undefined} editable={edit} placeholder="https://…"/>
          <ProfileField label="School / Organization" value={undefined} editable={edit}/>
          <ProfileField label="Interests" value={undefined} editable={edit} placeholder="History, Art, Geography"/>
          <ProfileField label="Language" value={"English / Polski"} editable={false}/>
        </div>
      </div>
    </section>
  );
}
