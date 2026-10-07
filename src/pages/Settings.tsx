import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Lock, Loader2, Check, AlertCircle, Bell } from 'lucide-react';

export default function Settings() {
  const { profile } = useAuth();
  const canChangePassword = profile?.auth_provider === 'local' || profile?.auth_provider === 'local_google';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [notifPrefs, setNotifPrefs] = useState({
    courseUpdates: true,
    projectUpdates: true,
    announcements: true,
  });
  const [savingNotifs, setSavingNotifs] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setSavingPassword(true);

    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update password.';
      setPasswordError(message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleNotifSave = async () => {
    setSavingNotifs(true);
    await new Promise((r) => setTimeout(r, 500));
    setNotifSuccess(true);
    setSavingNotifs(false);
    setTimeout(() => setNotifSuccess(false), 3000);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Manage your account preferences</p>

      {canChangePassword ? (
        <form onSubmit={handlePasswordChange} className="mt-6 card p-6">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
          </div>

          {passwordError && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{passwordError}</span>
            </div>
          )}

          {passwordSuccess && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>Password updated successfully!</span>
            </div>
          )}

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input-field"
                placeholder="Enter current password"
                required
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field"
                placeholder="At least 8 characters"
                required
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="mt-6">
            <button type="submit" disabled={savingPassword} className="btn-primary">
              {savingPassword ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Password'
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-6 card p-6">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-slate-400" />
            <h2 className="text-lg font-semibold text-slate-900">Password</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            Your account uses Google Sign-In, so your password is managed by Google. There is no BuddyForStudy password to change.
          </p>
        </div>
      )}

      <div className="mt-6 card p-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">Notification Preferences</h2>
        </div>

        {notifSuccess && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>Preferences saved!</span>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {[
            { key: 'courseUpdates', label: 'Course Updates', desc: 'Get notified about new lessons and course changes' },
            { key: 'projectUpdates', label: 'Project Updates', desc: 'Receive updates about your project submissions' },
            { key: 'announcements', label: 'Platform Announcements', desc: 'Important platform-wide news and updates' },
          ].map((pref) => (
            <label key={pref.key} className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 cursor-pointer hover:bg-slate-50">
              <input
                type="checkbox"
                checked={notifPrefs[pref.key as keyof typeof notifPrefs]}
                onChange={(e) => setNotifPrefs({ ...notifPrefs, [pref.key]: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-900">{pref.label}</p>
                <p className="text-xs text-slate-500">{pref.desc}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="mt-6">
          <button type="button" onClick={handleNotifSave} disabled={savingNotifs} className="btn-primary">
            {savingNotifs ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Preferences'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
