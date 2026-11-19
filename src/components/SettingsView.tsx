'use client';

import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Settings, User as UserIcon, Mail, Lock, Eye, EyeOff, LogOut, Check, Loader2 } from 'lucide-react';

interface SettingsViewProps {
  user: User;
  currentDisplayName: string;
  onProfileUpdated: (newName: string) => void;
  onLoggedOut: () => void;
}

export default function SettingsView({
  user,
  currentDisplayName,
  onProfileUpdated,
  onLoggedOut,
}: SettingsViewProps) {
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setDisplayName(currentDisplayName);
  }, [currentDisplayName]);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameMessage({ type: 'error', text: 'アカウント名を入力してください。' });
      return;
    }
    setSavingName(true);
    setNameMessage(null);
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email || '',
          display_name: trimmed,
        });
      if (profileError) throw profileError;

      await supabase.auth.updateUser({
        data: { display_name: trimmed },
      });

      onProfileUpdated(trimmed);
      setNameMessage({ type: 'success', text: 'アカウント名を更新しました。' });
    } catch (err: any) {
      setNameMessage({ type: 'error', text: err.message || 'アカウント名の更新に失敗しました。' });
    } finally {
      setSavingName(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: '新しいパスワードは6文字以上で入力してください。' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: '新しいパスワードと確認用パスワードが一致しません。' });
      return;
    }

    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setPasswordMessage({ type: 'success', text: 'パスワードを変更しました。' });
    } catch (err: any) {
      setPasswordMessage({ type: 'error', text: err.message || 'パスワードの変更に失敗しました。' });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLoggedOut();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-16 space-y-6">
      <div className="flex items-center gap-2.5">
        <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">アカウント設定</h1>
          <p className="text-xs text-slate-500">アカウント情報の確認・変更やログアウトを行えます。</p>
        </div>
      </div>

      {/* 1. アカウント名変更 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <UserIcon className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-800">アカウント名変更</h2>
        </div>

        {nameMessage && (
          <div
            className={`p-3 rounded-xl text-xs font-medium ${
              nameMessage.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-red-50 border border-red-200 text-red-600'
            }`}
          >
            {nameMessage.text}
          </div>
        )}

        <form onSubmit={handleUpdateName} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              現在のアカウント名
            </label>
            <input
              type="text"
              required
              maxLength={30}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="アカウント名を入力"
              className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingName}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              アカウント名を保存
            </button>
          </div>
        </form>
      </div>

      {/* 2. メールアドレス表示 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Mail className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-800">登録メールアドレス</h2>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            ログイン中のメールアドレス
          </label>
          <div className="px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 font-medium select-all">
            {user.email || '未設定'}
          </div>
        </div>
      </div>

      {/* 3. パスワード変更 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Lock className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-800">パスワード変更</h2>
        </div>

        {passwordMessage && (
          <div
            className={`p-3 rounded-xl text-xs font-medium ${
              passwordMessage.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-red-50 border border-red-200 text-red-600'
            }`}
          >
            {passwordMessage.text}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              新しいパスワード（6文字以上）
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-3.5 pr-10 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                aria-label={showNewPassword ? '新しいパスワードを非表示' : '新しいパスワードを表示'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              新しいパスワード（確認用）
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="もう一度新しいパスワードを入力"
                className="w-full pl-3.5 pr-10 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? '確認用パスワードを非表示' : '確認用パスワードを表示'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">パスワードが一致していません</p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPassword}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {savingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
              パスワードを変更
            </button>
          </div>
        </form>
      </div>

      {/* 4. ログアウト */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-800">ログアウト</h2>
          <p className="text-xs text-slate-500 mt-0.5">現在のアカウントからサインアウトします。</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          ログアウトする
        </button>
      </div>
    </div>
  );
}
