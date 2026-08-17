"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useToast } from "@/components/ui/Toast";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/messages";
import { marketingUserProfileService, type MarketingUserProfile, type MarketingUserProfileRequest } from "@/services/marketing-service/marketingUserProfileService";
import { userService } from "@/services/userService";

const AVATAR_FALLBACK_TEXT = "LS";

export default function AccountPage() {
  const { user, logout, logoutAll, hasServiceAccess } = useAuth();
  const { theme, toggleTheme } = usePreferences();
  const { showToast } = useToast();
  const [language, setLanguage] = useState<SupportedLocale>("en");

  // Marketing profile state
  const [marketingProfile, setMarketingProfile] = useState<MarketingUserProfile | null>(null);
  const [marketingProfileLoading, setMarketingProfileLoading] = useState(false);
  const [marketingProfileForm, setMarketingProfileForm] = useState<MarketingUserProfileRequest>({
    departmentManager: "",
    managerName: "",
    userSignature: "",
  });
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password change state
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const canAccessMarketing = hasServiceAccess("marketing");

  // Load marketing profile
  useEffect(() => {
    if (canAccessMarketing && user?.id) {
      loadMarketingProfile();
    }
  }, [canAccessMarketing, user?.id]);

  const loadMarketingProfile = async () => {
    if (!user?.id) return;

    setMarketingProfileLoading(true);
    try {
      const profile = await marketingUserProfileService.getCurrentUserProfile();
      setMarketingProfile(profile);
      setMarketingProfileForm({
        departmentManager: profile.departmentManager || "",
        managerName: profile.managerName || "",
        userSignature: profile.userSignature || "",
      });
    } catch (error) {
      console.error("Failed to load marketing profile:", error);
      // Don't show error toast for new users (profile might not exist yet)
    } finally {
      setMarketingProfileLoading(false);
    }
  };

  const handleSignatureFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file type and size
      if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        showToast('File size must be less than 5MB', 'error');
        return;
      }

      setSignatureFile(file);

      // Convert to base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setMarketingProfileForm(prev => ({
          ...prev,
          userSignature: base64
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMarketingProfileSave = async () => {
    if (!user?.id) return;

    setSavingProfile(true);
    try {
      const updatedProfile = await marketingUserProfileService.updateCurrentUserProfile(marketingProfileForm);
      setMarketingProfile(updatedProfile);
      showToast('Marketing profile updated successfully', 'success');
    } catch (error) {
      console.error("Failed to update marketing profile:", error);
      showToast('Failed to update marketing profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!user?.id) return;
    if (newPassword.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    setIsSavingPassword(true);
    try {
      await userService.updatePassword(user.id, newPassword);
      showToast('Password updated successfully', 'success');
      setIsChangingPassword(false);
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      console.error("Failed to update password:", error);
      showToast('Failed to update password', 'error');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const displayName = user?.fullName ?? user?.username ?? "Operator";
  const derivedEmail = user
    ? `${user.username}@lucky-system.io`
    : "operator@lucky-system.io";

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 border-b border-white/10 pb-4">
        <p className="text-xs uppercase tracking-[0.4em] text-amber-400">
          Account Workspace
        </p>
        <h1 className="text-3xl font-semibold text-white">
          Profile & Preferences
        </h1>
        <p className="text-sm text-slate-300">
          Manage profile photo, security, localization, and UI preferences from
          one curated console.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-orange-400/60 bg-gradient-to-br from-orange-500 to-amber-400 text-3xl font-bold text-slate-950">
              {displayName.slice(0, 2).toUpperCase() || AVATAR_FALLBACK_TEXT}
            </div>
            <p className="mt-4 text-xl font-semibold text-white">
              {displayName}
            </p>
            <p className="text-sm text-slate-400">{derivedEmail}</p>
            <div className="mt-5 flex flex-col gap-3 w-full">
              <button className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-orange-400/60 hover:bg-orange-400/10">
                Change photo
              </button>
              <button
                onClick={logout}
                className="rounded-2xl border border-red-500/50 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/10"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-white">Profile details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full name" value={user?.fullName ?? "—"} />
            <Field label="Username" value={user?.username ?? "—"} />
            <Field label="Email" value={derivedEmail} />
            <Field
              label="Last login"
              value={
                user?.lastLoginAt
                  ? new Date(user.lastLoginAt).toLocaleString()
                  : "No sessions yet"
              }
            />
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button 
              onClick={() => setIsChangingPassword(!isChangingPassword)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${isChangingPassword ? "bg-orange-400/20 text-amber-200 border-orange-400/60" : "border-white/10 text-amber-200/80 hover:border-orange-400/60 hover:bg-orange-400/10"}`}
            >
              Change password
            </button>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/80 transition hover:border-orange-400/60 hover:bg-orange-400/10">
              Two-factor auth
            </button>
          </div>
          {isChangingPassword && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-white mb-4">Change Password</h3>
              <div className="space-y-4">
                <div className="flex flex-col">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400 mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-orange-400/60 focus:outline-none"
                    placeholder="Enter new password"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-orange-400/60 focus:outline-none"
                    placeholder="Confirm new password"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setIsChangingPassword(false);
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePasswordChange}
                    disabled={isSavingPassword || !newPassword || !confirmPassword}
                    className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingPassword ? "Saving..." : "Save Password"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">Theme & language</h2>
          <p className="mt-1 text-sm text-slate-400">
            Personalize the operator console experience.
          </p>
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <p className="font-semibold text-white">Theme</p>
                <p className="text-sm text-slate-400">
                  Current theme: {theme === "ember" ? "Ember" : "Light"}
                </p>
              </div>
              <button
                onClick={toggleTheme}
                className="rounded-full border border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/80 transition hover:border-orange-400/60 hover:bg-orange-400/10"
              >
                Toggle
              </button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <label className="text-sm font-semibold text-white">
                Language
                <select
                  value={language}
                  onChange={(event) =>
                    setLanguage(event.target.value as SupportedLocale)
                  }
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  {SUPPORTED_LOCALES.map((localeOption) => (
                    <option
                      key={localeOption}
                      value={localeOption}
                      className="bg-slate-900 text-white"
                    >
                      {localeOption.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-xs text-slate-400">
                Localization hooks tie into the i18n resources.
              </p>
            </div>
          </div>
        </div>

        {/* Marketing Profile Section - Only for marketing service users */}
        {canAccessMarketing && (
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold text-white">
              Marketing Service Profile
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Department manager information and digital signature for marketing operations.
            </p>

            {marketingProfileLoading ? (
              <div className="mt-4 text-center text-slate-400">
                Loading marketing profile...
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col text-xs text-slate-300">
                    <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                      Department Manager
                    </label>
                    <input
                      type="text"
                      value={marketingProfileForm.departmentManager}
                      onChange={(e) => setMarketingProfileForm(prev => ({
                        ...prev,
                        departmentManager: e.target.value
                      }))}
                      className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      placeholder="Enter department manager name"
                    />
                  </div>

                  <div className="flex flex-col text-xs text-slate-300">
                    <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                      Manager Name
                    </label>
                    <input
                      type="text"
                      value={marketingProfileForm.managerName}
                      onChange={(e) => setMarketingProfileForm(prev => ({
                        ...prev,
                        managerName: e.target.value
                      }))}
                      className="mt-1 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white focus:border-amber-400/60 focus:outline-none"
                      placeholder="Enter manager name"
                    />
                  </div>
                </div>

                <div className="flex flex-col text-xs text-slate-300">
                  <label className="text-[0.6rem] uppercase tracking-[0.25em] text-slate-400">
                    Digital Signature
                  </label>
                  <div className="mt-1 space-y-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleSignatureFileChange}
                      className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white file:border-0 file:bg-amber-500/20 file:text-amber-200 file:rounded-lg file:px-3 file:py-1 file:text-xs file:font-semibold focus:border-amber-400/60 focus:outline-none"
                    />
                    <p className="text-xs text-slate-500">
                      Upload signature image (max 5MB, JPG/PNG)
                    </p>

                    {marketingProfileForm.userSignature && (
                      <div className="mt-2">
                        <p className="text-xs text-slate-400 mb-2">Current signature:</p>
                        <div className="inline-block rounded-lg border border-white/20 overflow-hidden">
                          <img
                            src={marketingProfileForm.userSignature}
                            alt="Signature"
                            className="h-20 w-auto object-contain bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleMarketingProfileSave}
                    disabled={savingProfile}
                    className="rounded-full border border-amber-400/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-amber-200/80 transition hover:border-amber-400 hover:bg-amber-400/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {savingProfile ? "Saving..." : "Save Marketing Profile"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6">
          <h2 className="text-lg font-semibold text-white">
            Security & sessions
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Review active sessions, revoke access, and receive alerts.
          </p>
          <div className="mt-5 space-y-4">
            {["MacBook Pro · Chrome", "Pixel 8 · Mobile App"].map((device) => (
              <div
                key={device}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <div>
                  <p className="font-semibold text-white">{device}</p>
                  <p className="text-xs text-slate-500">
                    Last active · just now
                  </p>
                </div>
                <button className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-red-200/80 transition hover:border-red-500/60 hover:bg-red-500/10">
                  Revoke
                </button>
              </div>
            ))}
            <button
              onClick={logoutAll}
              className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:border-red-500/60 hover:bg-red-500/10"
            >
              Sign out from all devices
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

type FieldProps = {
  label: string;
  value: string;
};

function Field({ label, value }: FieldProps) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-xs uppercase tracking-[0.3em] text-amber-200/70">
        {label}
      </span>
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-base text-white">
        {value}
      </div>
    </label>
  );
}
