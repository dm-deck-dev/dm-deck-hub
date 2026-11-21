'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { Card } from '@/types/card';
import {
  Settings,
  User as UserIcon,
  Mail,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Check,
  Loader2,
  FileSpreadsheet,
  Download,
  Upload,
  FileDown,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';

interface SettingsViewProps {
  user: User;
  currentDisplayName: string;
  cards: Card[];
  counts: Record<string, number>;
  onCountsUpdated: (updatedCounts: Record<string, number>) => void;
  onProfileUpdated: (newName: string) => void;
  onLoggedOut: () => void;
}

interface ParsedImportItem {
  card: Card;
  quantity: number;
  sourceName: string;
}

interface ImportPreview {
  fileName: string;
  matched: ParsedImportItem[];
  unmatched: { rowNum: number; name: string; reason: string }[];
}

const normalizeNameForMatch = (value: string): string =>
  value
    .normalize('NFKC')
    .replace(/[\s\u3000・･\-‐‑‒–—―ー−_()（）「」『』【】［］\[\]\/／!！?？,，.．:：;；'"’”]+/g, '')
    .toLowerCase();

export default function SettingsView({
  user,
  currentDisplayName,
  cards,
  counts,
  onCountsUpdated,
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

  // Excel エクスポート＆一括登録ステート
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<'overwrite' | 'add'>('overwrite');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [excelMessage, setExcelMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setDisplayName(currentDisplayName);
  }, [currentDisplayName]);

  const ownedSummary = useMemo(() => {
    let uniqueCount = 0;
    let totalSheets = 0;
    cards.forEach((c) => {
      const cnt = counts[c.id] || 0;
      if (cnt > 0) {
        uniqueCount += 1;
        totalSheets += cnt;
      }
    });
    return { uniqueCount, totalSheets };
  }, [cards, counts]);

  // 1. 所持カードのみのExcelダウンロード
  const handleExportOwnedExcel = () => {
    setExcelMessage(null);
    const ownedRows = cards
      .filter((c) => (counts[c.id] || 0) > 0)
      .map((c) => ({
        カードID: c.id,
        カード名: c.name,
        文明: Array.isArray(c.civilization) ? c.civilization.join('/') : '',
        コスト: c.cost ?? '',
        タイプ: c.card_type || '',
        種族: Array.isArray(c.race) ? c.race.join('/') : '',
        レアリティ: c.rarity || '',
        収録弾: c.set_name || '',
        所持枚数: counts[c.id] || 0,
      }));

    if (ownedRows.length === 0) {
      setExcelMessage({ type: 'error', text: '現在所持しているカード（1枚以上）がないため出力できません。' });
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(ownedRows);
    worksheet['!cols'] = [
      { wch: 18 },
      { wch: 34 },
      { wch: 14 },
      { wch: 8 },
      { wch: 18 },
      { wch: 24 },
      { wch: 12 },
      { wch: 28 },
      { wch: 10 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '所持カード一覧');

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `DM_Deck_Hub_所持カード一覧_${today}.xlsx`);
    setExcelMessage({
      type: 'success',
      text: `所持カード ${ownedRows.length} 種類（合計 ${ownedSummary.totalSheets} 枚）をExcelでダウンロードしました。`,
    });
  };

  // 2. 一括登録用テンプレートのダウンロード
  const handleDownloadTemplate = () => {
    setExcelMessage(null);
    const sample1 = cards[0];
    const sample2 = cards[1];

    const templateRows = [
      {
        カード名: sample1 ? sample1.name : 'ボルシャック・ドラゴン',
        所持枚数: 4,
        '収録弾（任意）': sample1?.set_name || '',
        'カードID（任意）': '',
      },
      {
        カード名: sample2 ? sample2.name : 'アクア・ハルカス',
        所持枚数: 2,
        '収録弾（任意）': '',
        'カードID（任意）': '',
      },
    ];

    const sheetMain = XLSX.utils.json_to_sheet(templateRows);
    sheetMain['!cols'] = [
      { wch: 36 },
      { wch: 12 },
      { wch: 30 },
      { wch: 20 },
    ];

    const guideRows = [
      { 項目: 'カード名（必須）', 説明: '登録したいカードの名称を入力してください。全角・半角や記号の多少の揺れは自動で判定されます。' },
      { 項目: '所持枚数（必須）', 説明: '0以上の半角数字を入力してください（例: 4）。0を入力して上書き登録すると未所持になります。' },
      { 項目: '収録弾（任意）', 説明: '同名再録カードで特定の収録弾を指定したい場合のみ入力してください。空欄でも登録できます。' },
      { 項目: 'カードID（任意）', 説明: '所持カード一覧エクスポートで出力された「カードID」が入っている場合は、IDで最優先に一致させます。' },
      { 項目: 'サンプル行について', 説明: '1シート目の2〜3行目は記入例です。実際にご自身のカードを入力する際は上書きまたは削除してご利用ください。' },
    ];
    const sheetGuide = XLSX.utils.json_to_sheet(guideRows);
    sheetGuide['!cols'] = [{ wch: 22 }, { wch: 80 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheetMain, '所持カード登録');
    XLSX.utils.book_append_sheet(workbook, sheetGuide, '入力ガイド');

    XLSX.writeFile(workbook, 'DM_Deck_Hub_一括登録テンプレート.xlsx');
  };

  // 3. Excelファイル選択＆解析プレビュー
  const handleExcelFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelMessage(null);
    setImportPreview(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setExcelMessage({ type: 'error', text: 'Excelファイルにシートが見つかりませんでした。' });
        return;
      }

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], {
        defval: '',
      });

      if (rawRows.length === 0) {
        setExcelMessage({ type: 'error', text: 'シートにデータ行がありません。テンプレートに沿って入力してください。' });
        return;
      }

      // 検索用インデックス構築
      const cardById = new Map<string, Card>();
      const cardsByNormalizedName = new Map<string, Card[]>();
      cards.forEach((c) => {
        cardById.set(String(c.id).trim(), c);
        const norm = normalizeNameForMatch(c.name);
        if (norm) {
          const list = cardsByNormalizedName.get(norm) || [];
          list.push(c);
          cardsByNormalizedName.set(norm, list);
        }
      });

      const aggregatedByCardId = new Map<string, ParsedImportItem>();
      const unmatched: { rowNum: number; name: string; reason: string }[] = [];

      rawRows.forEach((row, index) => {
        const rowNum = index + 2; // ヘッダーが1行目
        const rawId = String(
          row['カードID（任意）'] ?? row['カードID'] ?? row['id'] ?? row['card_id'] ?? ''
        ).trim();
        const rawName = String(
          row['カード名（必須）'] ?? row['カード名'] ?? row['name'] ?? ''
        ).trim();
        const rawSet = String(
          row['収録弾（任意）'] ?? row['収録弾'] ?? row['set_name'] ?? ''
        ).trim();
        const rawQty = row['所持枚数（必須）'] ?? row['所持枚数'] ?? row['枚数'] ?? row['count'] ?? '';

        if (!rawId && !rawName && String(rawQty).trim() === '') {
          return; // 完全空行はスキップ
        }

        const parsedQty = Number(String(rawQty).replace(/[^\d.-]/g, ''));
        if (String(rawQty).trim() === '' || Number.isNaN(parsedQty) || parsedQty < 0) {
          unmatched.push({
            rowNum,
            name: rawName || rawId || '(名称なし)',
            reason: '所持枚数が正しい数値（0以上）ではありません',
          });
          return;
        }
        const quantity = Math.floor(parsedQty);

        let matchedCard: Card | undefined;
        if (rawId && cardById.has(rawId)) {
          matchedCard = cardById.get(rawId);
        } else if (rawName) {
          const candidates = cardsByNormalizedName.get(normalizeNameForMatch(rawName)) || [];
          if (candidates.length === 1) {
            matchedCard = candidates[0];
          } else if (candidates.length > 1) {
            if (rawSet) {
              const normSet = normalizeNameForMatch(rawSet);
              matchedCard =
                candidates.find((c) => c.set_name && normalizeNameForMatch(c.set_name).includes(normSet)) ||
                candidates[0];
            } else {
              matchedCard = candidates[0];
            }
          }
        }

        if (!matchedCard) {
          unmatched.push({
            rowNum,
            name: rawName || rawId || '(名称なし)',
            reason: '一致するカードがデータベースに見つかりません',
          });
          return;
        }

        const existing = aggregatedByCardId.get(matchedCard.id);
        if (existing) {
          existing.quantity += quantity;
        } else {
          aggregatedByCardId.set(matchedCard.id, {
            card: matchedCard,
            quantity,
            sourceName: rawName || matchedCard.name,
          });
        }
      });

      const matched = Array.from(aggregatedByCardId.values());
      if (matched.length === 0 && unmatched.length === 0) {
        setExcelMessage({ type: 'error', text: '有効なデータ行が見つかりませんでした。' });
        return;
      }

      setImportPreview({
        fileName: file.name,
        matched,
        unmatched,
      });
    } catch (err: any) {
      setExcelMessage({
        type: 'error',
        text: err?.message || 'Excelファイルの読み込みに失敗しました。ファイル形式をご確認ください。',
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 4. プレビュー内容の確定登録（Supabase user_cards へ一括保存）
  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.matched.length === 0) return;
    setIsImporting(true);
    setExcelMessage(null);

    try {
      const nextCounts: Record<string, number> = { ...counts };
      const upsertRows: { user_id: string; card_id: string; count: number }[] = [];

      importPreview.matched.forEach(({ card, quantity }) => {
        const current = nextCounts[card.id] || 0;
        const finalCount = importMode === 'add' ? current + quantity : quantity;
        nextCounts[card.id] = finalCount;
        upsertRows.push({
          user_id: user.id,
          card_id: card.id,
          count: finalCount,
        });
      });

      // 200件ずつ分割して upsert
      const BATCH_SIZE = 200;
      for (let i = 0; i < upsertRows.length; i += BATCH_SIZE) {
        const chunk = upsertRows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('user_cards')
          .upsert(chunk, { onConflict: 'user_id,card_id' });
        if (error) throw error;
      }

      onCountsUpdated(nextCounts);
      const registeredCount = importPreview.matched.length;
      const totalImportedSheets = importPreview.matched.reduce((sum, item) => sum + item.quantity, 0);
      setImportPreview(null);
      setExcelMessage({
        type: 'success',
        text: `${registeredCount} 種類のカード（計 ${totalImportedSheets} 枚分）を${
          importMode === 'add' ? '加算' : '上書き'
        }登録しました！`,
      });
    } catch (err: any) {
      setExcelMessage({
        type: 'error',
        text: err?.message || '一括登録の保存中にエラーが発生しました。',
      });
    } finally {
      setIsImporting(false);
    }
  };

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
          <h1 className="text-lg font-bold text-slate-900">設定・データ管理</h1>
          <p className="text-xs text-slate-500">所持カードのExcel出力・一括登録やアカウント設定を行えます。</p>
        </div>
      </div>

      {/* Excelデータ管理（所持カード出力・一括登録） */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-800">所持カード Excel出力・一括登録</h2>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            現在: {ownedSummary.uniqueCount}種 / {ownedSummary.totalSheets}枚
          </span>
        </div>

        {excelMessage && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-start justify-between gap-2 ${
              excelMessage.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            <div className="flex items-start gap-2">
              {excelMessage.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <span>{excelMessage.text}</span>
            </div>
            <button type="button" onClick={() => setExcelMessage(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* A. 所持カードのみのExcelダウンロード */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-xs font-bold text-slate-800">所持カード一覧をExcelでダウンロード</h3>
            <p className="text-[11px] text-slate-500">
              1枚以上所持しているカードのみを抽出し、Excelファイル（.xlsx）で保存します。
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportOwnedExcel}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            所持カードを出力 (.xlsx)
          </button>
        </div>

        {/* B. Excel一括登録＆テンプレートダウンロード */}
        <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/80 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-800">Excelから所持カードを一括登録</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                テンプレートに「カード名」と「所持枚数」を入力して読み込むとまとめて登録できます。
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-300 text-[11px] font-bold rounded-xl transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
            >
              <FileDown className="h-3.5 w-3.5" />
              テンプレートをダウンロード
            </button>
          </div>

          {/* 登録モード切替 */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11px] font-bold text-slate-600">登録方法:</span>
            <button
              type="button"
              onClick={() => setImportMode('overwrite')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                importMode === 'overwrite'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              指定枚数で上書き
            </button>
            <button
              type="button"
              onClick={() => setImportMode('add')}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition cursor-pointer ${
                importMode === 'add'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              現在の所持数に加算
            </button>
          </div>

          {/* ファイル選択ボタン */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleExcelFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-blue-300 bg-white hover:bg-blue-50/70 hover:border-blue-500 text-blue-700 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              Excelファイル（.xlsx / .xls / .csv）を選択して読み込む
            </button>
          </div>

          {/* 読み込みプレビュー結果 */}
          {importPreview && (
            <div className="p-3.5 rounded-xl bg-white border border-blue-200 space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">読込ファイル: {importPreview.fileName}</p>
                  <p className="text-[11px] text-slate-500">
                    一致: <span className="font-bold text-emerald-600">{importPreview.matched.length}件</span> / 未一致・エラー:{' '}
                    <span className="font-bold text-rose-600">{importPreview.unmatched.length}件</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImportPreview(null)}
                  className="text-[11px] text-slate-400 hover:text-slate-600 underline shrink-0 cursor-pointer"
                >
                  キャンセル
                </button>
              </div>

              {importPreview.matched.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 text-[11px]">
                  {importPreview.matched.slice(0, 50).map((item) => {
                    const current = counts[item.card.id] || 0;
                    const after = importMode === 'add' ? current + item.quantity : item.quantity;
                    return (
                      <div key={item.card.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700 truncate">{item.card.name}</span>
                        <span className="shrink-0 font-bold text-blue-600">
                          {current}枚 → {after}枚
                        </span>
                      </div>
                    );
                  })}
                  {importPreview.matched.length > 50 && (
                    <div className="px-2.5 py-1.5 text-center text-slate-400">
                      ほか {importPreview.matched.length - 50} 件のカード...
                    </div>
                  )}
                </div>
              )}

              {importPreview.unmatched.length > 0 && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 space-y-1">
                  <p className="text-[11px] font-bold text-rose-700">
                    以下の行は一致しなかったためスキップされます（最大10件表示）:
                  </p>
                  <ul className="text-[10px] text-rose-600 space-y-0.5 max-h-24 overflow-y-auto">
                    {importPreview.unmatched.slice(0, 10).map((u, idx) => (
                      <li key={idx}>
                        {u.rowNum}行目「{u.name}」: {u.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {importPreview.matched.length > 0 && (
                <button
                  type="button"
                  disabled={isImporting}
                  onClick={handleConfirmImport}
                  className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      一括登録中...
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      {importPreview.matched.length}件のカードを確定して登録する
                    </>
                  )}
                </button>
              )}
            </div>
          )}
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
