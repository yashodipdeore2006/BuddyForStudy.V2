import { useState } from 'react';
import PageHeader from "@/components/PageHeader";
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import {
  User as UserIcon,
  Mail,
  Shield,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

export default function Profile() {
  const { profile, session, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name || '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });

      await refreshProfile();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update profile.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader title="Profile" subtitle="Manage your account information." />

      <div className="mt-6 card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-xl font-bold text-blue-700">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{profile.name}</h2>
            <p className="text-sm text-slate-500">{session?.user.email}</p>
            <div className="mt-1 flex items-center gap-2">
              {profile.role === 'admin' ? (
                <span className="badge bg-blue-50 text-blue-700">
                  <Shield className="h-3 w-3" /> Administrator
                </span>
              ) : (
                <span className="badge bg-slate-100 text-slate-600">Student</span>
              )}
              <span className={`badge ${profile.is_active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {profile.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-6 text-sm">
          <div>
            <p className="text-slate-400">Member Since</p>
            <p className="font-medium text-slate-900">{formatDate(profile.created_at)}</p>
          </div>
          <div>
            <p className="text-slate-400">Account ID</p>
            <p className="font-mono text-xs text-slate-600 truncate">{profile.id}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-6 card p-6">
        <h3 className="text-lg font-semibold text-slate-900">Edit Profile</h3>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>Profile updated successfully!</span>
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-field pl-10"
                minLength={2}
                maxLength={100}
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={session?.user.email || ''}
                disabled
                className="input-field pl-10 bg-slate-50 text-slate-500"
              />
            </div>
            <p className="mt-1 text-xs text-slate-400">Email cannot be changed</p>
          </div>
        </div>

        <div className="mt-6">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
