import React, { useState } from 'react';
import { User, Mail, Lock, CheckCircle2, Download, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export const AccountView: React.FC = () => {
  const { user, refreshUser, logout } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [nameStatus, setNameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [nameError, setNameError] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'saving' | 'sent' | 'error'>('idle');
  const [emailError, setEmailError] = useState('');

  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'error'>('idle');
  const [exportError, setExportError] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [deleteError, setDeleteError] = useState('');

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameStatus('saving');
    setNameError('');
    try {
      await api.updateProfileName(name.trim());
      await refreshUser();
      setNameStatus('saved');
    } catch (err: any) {
      setNameStatus('error');
      setNameError(err?.message || 'Could not update your name. Please try again.');
    }
  };

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailStatus('saving');
    setEmailError('');
    try {
      const res = await api.changeEmail(newEmail.trim(), currentPassword);
      setEmailStatus('sent');
      setCurrentPassword('');
      setNewEmail('');
      // res.message already carries the "check both inboxes" copy the
      // server produced — no need to duplicate it here.
      void res;
    } catch (err: any) {
      setEmailStatus('error');
      setEmailError(err?.message || 'Could not change your email. Please try again.');
    }
  };

  const handleExport = async () => {
    setExportStatus('exporting');
    setExportError('');
    try {
      const data = await api.exportAccountData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mlo-wangu-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportStatus('idle');
    } catch (err: any) {
      setExportStatus('error');
      setExportError(err?.message || 'Could not export your data. Please try again.');
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteStatus('deleting');
    setDeleteError('');
    try {
      await api.deleteAccount(deletePassword);
      await logout();
    } catch (err: any) {
      setDeleteStatus('error');
      setDeleteError(err?.message || 'Could not delete your account. Please try again.');
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-200 max-w-2xl">
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-[#14532D]/10 text-[#14532D] border border-[#14532D]/20">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-[#17201A] tracking-tight">Account</h1>
            <p className="text-xs text-[#66736A] mt-0.5">Manage your name and sign-in email.</p>
          </div>
        </div>
      </div>

      {/* Name */}
      <form onSubmit={handleSaveName} className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-[#17201A]">Display name</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setNameStatus('idle'); }}
          maxLength={100}
          required
          className="w-full px-4 py-2.5 rounded-xl border border-[#E8E5DD] text-sm focus:outline-none focus:ring-2 focus:ring-[#14532D]/30"
        />
        {nameStatus === 'error' && <p className="text-xs text-red-600">{nameError}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={nameStatus === 'saving' || !name.trim()}
            className="px-4 py-2 rounded-xl bg-[#14532D] text-white text-sm font-bold disabled:opacity-50"
          >
            {nameStatus === 'saving' ? 'Saving…' : 'Save name'}
          </button>
          {nameStatus === 'saved' && (
            <span className="inline-flex items-center gap-1 text-xs text-[#14532D] font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Saved
            </span>
          )}
        </div>
      </form>

      {/* Email */}
      <form onSubmit={handleChangeEmail} className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-[#17201A] flex items-center gap-2">
          <Mail className="w-4 h-4 text-[#14532D]" /> Change email
        </h2>
        <p className="text-xs text-[#66736A]">
          Current email: <span className="font-semibold text-[#17201A]">{user?.email}</span>. You'll need to confirm the change from links sent to both your current and new email addresses before it takes effect.
        </p>
        <div>
          <label className="text-xs font-semibold text-[#66736A]">New email address</label>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => { setNewEmail(e.target.value); setEmailStatus('idle'); }}
            required
            className="mt-1 w-full px-4 py-2.5 rounded-xl border border-[#E8E5DD] text-sm focus:outline-none focus:ring-2 focus:ring-[#14532D]/30"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#66736A] flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> Current password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => { setCurrentPassword(e.target.value); setEmailStatus('idle'); }}
            required
            className="mt-1 w-full px-4 py-2.5 rounded-xl border border-[#E8E5DD] text-sm focus:outline-none focus:ring-2 focus:ring-[#14532D]/30"
          />
        </div>
        {emailStatus === 'error' && <p className="text-xs text-red-600">{emailError}</p>}
        {emailStatus === 'sent' && (
          <p className="text-xs text-[#14532D] font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" /> Check both inboxes to confirm the change.
          </p>
        )}
        <button
          type="submit"
          disabled={emailStatus === 'saving' || !newEmail.trim() || !currentPassword}
          className="px-4 py-2 rounded-xl bg-[#14532D] text-white text-sm font-bold disabled:opacity-50"
        >
          {emailStatus === 'saving' ? 'Sending…' : 'Change email'}
        </button>
      </form>

      {/* Data export — Phase 3B, item 8 */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-[#E8E5DD] shadow-xs space-y-3">
        <h2 className="text-sm font-extrabold text-[#17201A] flex items-center gap-2">
          <Download className="w-4 h-4 text-[#14532D]" /> Download your data
        </h2>
        <p className="text-xs text-[#66736A]">
          Get a copy of everything Mlo Wangu holds about you — profile, household, meals, meal plans, shopping lists, water logs, reminders, notifications, and payment history. Unlock your Budget first if you also want your salary and expenses included.
        </p>
        {exportStatus === 'error' && <p className="text-xs text-red-600">{exportError}</p>}
        <button
          onClick={handleExport}
          disabled={exportStatus === 'exporting'}
          className="px-4 py-2 rounded-xl bg-[#14532D]/10 text-[#14532D] text-sm font-bold border border-[#14532D]/20 disabled:opacity-50"
        >
          {exportStatus === 'exporting' ? 'Preparing…' : 'Download my data'}
        </button>
      </div>

      {/* Danger zone: account deletion — Phase 3B, item 9 */}
      <form onSubmit={handleDeleteAccount} className="bg-white p-5 sm:p-6 rounded-3xl border border-red-200 shadow-xs space-y-4">
        <h2 className="text-sm font-extrabold text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Delete my account
        </h2>
        <p className="text-xs text-[#66736A]">
          This permanently deletes your account and all associated data. This action cannot be undone.
        </p>
        <div>
          <label className="text-xs font-semibold text-[#66736A]">Current password</label>
          <input
            type="password"
            value={deletePassword}
            onChange={(e) => { setDeletePassword(e.target.value); setDeleteStatus('idle'); }}
            required
            className="mt-1 w-full px-4 py-2.5 rounded-xl border border-[#E8E5DD] text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#66736A]">Type DELETE to confirm</label>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => { setDeleteConfirmText(e.target.value); setDeleteStatus('idle'); }}
            required
            className="mt-1 w-full px-4 py-2.5 rounded-xl border border-[#E8E5DD] text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
          />
        </div>
        {deleteStatus === 'error' && <p className="text-xs text-red-600">{deleteError}</p>}
        <button
          type="submit"
          disabled={deleteStatus === 'deleting' || !deletePassword || deleteConfirmText !== 'DELETE'}
          className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50"
        >
          {deleteStatus === 'deleting' ? 'Deleting…' : 'Permanently delete my account'}
        </button>
      </form>
    </div>
  );
};
