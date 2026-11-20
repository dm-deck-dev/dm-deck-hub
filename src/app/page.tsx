'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import AuthModal from '@/components/AuthModal';
import SettingsView from '@/components/SettingsView';
import { Card } from '@/types/card';
import {
  Search,
  Plus,
  Minus,
  X,
  LogIn,
  LogOut,
  User as UserIcon,
  Layers,
  Save,
  Trash2,
  BarChart2,
  CheckCircle,
  AlertCircle,
  LayoutGrid,
  List,
  FolderOpen,
  PlusCircle,
  ShoppingCart,
  Share2,
  Check,
  ChevronDown,
  ChevronUp,
  Play,
  RotateCcw,
  Swords,
  Skull,
  ArrowRight,
  Camera,
  Shield,
  Layers as DeckIcon,
  Zap,
  Loader2,
  Users,
  UserPlus,
  ArrowLeftRight,
  Copy,
  Eye,
  Send,
} from 'lucide-react';
import { User } from '@supabase/supabase-js';

const DEFAULT_CARDS: Card[] = [];

const MAX_DECK_LIMIT = 60;
const BASE_DECK_LIMIT = 40;
const CARDS_PER_PAGE = 50;
const CARDS_CACHE_KEY = 'dm_deck_hub_cards_cache_v7';
const CARDS_CACHE_TTL_MS = 1000 * 60 * 30; // 30分間キャッシュを有効化

type DuelPhase = 'untap' | 'draw' | 'mana' | 'main' | 'battle' | 'end';

const PHASES: { key: DuelPhase; label: string }[] = [
  { key: 'untap', label: 'アンタップ' },
  { key: 'draw', label: 'ドロー' },
  { key: 'mana', label: 'マナ' },
  { key: 'main', label: 'メイン' },
  { key: 'battle', label: 'バトル' },
  { key: 'end', label: 'エンド' },
];

interface SimCardInstance {
  instanceId: string;
  card: Card;
  isTapped?: boolean;
  summonedTurn?: number;
}

interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  friend_code: string;
}

interface FriendshipItem {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted';
  created_at: string;
  partner: UserProfile;
  isIncoming: boolean;
}

interface TradeCardEntry {
  card_id: string;
  count: number;
}

interface TradeRequestItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  offered_card_id: string | null;
  offered_count: number;
  requested_card_id: string;
  requested_count: number;
  requested_items?: TradeCardEntry[];
  offered_items?: TradeCardEntry[];
  message: string | null;
  counter_message?: string | null;
  status: 'pending' | 'countered' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  sender?: UserProfile;
  receiver?: UserProfile;
}

export default function DMApp() {
  const [cards, setCards] = useState<Card[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [user, setUser] = useState<User | null>(null);

  const cardListTopRef = useRef<HTMLDivElement | null>(null);
  const isInitialFilterMount = useRef<boolean>(true);
  const isViewRestored = useRef<boolean>(false);

  const [activeTab, setActiveTab] = useState<'collection' | 'deck' | 'friends' | 'settings'>('deck');

  useEffect(() => {
    try {
      const savedTab = sessionStorage.getItem('dm_deck_hub_active_tab');
      if (savedTab === 'collection' || savedTab === 'deck' || savedTab === 'friends' || savedTab === 'settings') {
        setActiveTab(savedTab);
      }
      const savedPage = Number(sessionStorage.getItem('dm_deck_hub_current_page'));
      if (Number.isInteger(savedPage) && savedPage >= 1) {
        setCurrentPage(savedPage);
      }
    } catch {}
    isViewRestored.current = true;
  }, []);

  useEffect(() => {
    if (!isViewRestored.current) return;
    try {
      sessionStorage.setItem('dm_deck_hub_active_tab', activeTab);
    } catch {}
  }, [activeTab]);

  useEffect(() => {
    if (!isViewRestored.current) return;
    try {
      sessionStorage.setItem('dm_deck_hub_current_page', String(currentPage));
    } catch {}
  }, [currentPage]);
  const [deckViewMode, setDeckViewMode] = useState<'tiles' | 'list'>('tiles');

  const [currentDeckId, setCurrentDeckId] = useState<string | null>(null);
  const [deckName, setDeckName] = useState<string>('新規デッキ');
  const [deckCards, setDeckCards] = useState<Record<string, number>>({});
  const [deckSaving, setDeckSaving] = useState<boolean>(false);
  const [isExportingImage, setIsExportingImage] = useState<boolean>(false);
  const [deckMessage, setDeckMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // ---------------- フレンド＆トレード関連ステート ----------------
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [friendSearchInput, setFriendSearchInput] = useState('');
  const [friendships, setFriendships] = useState<FriendshipItem[]>([]);
  const [tradeRequests, setTradeRequests] = useState<TradeRequestItem[]>([]);
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendMessage, setFriendMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [copiedFriendCode, setCopiedFriendCode] = useState(false);

  const [selectedFriend, setSelectedFriend] = useState<UserProfile | null>(null);
  const [friendCardCounts, setFriendCardCounts] = useState<Record<string, number>>({});
  const [loadingFriendCards, setLoadingFriendCards] = useState(false);
  const [friendOnlyUnownedByMe, setFriendOnlyUnownedByMe] = useState(false);

  // トレード申請モーダルステート（複数種・複数枚選択対応）
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [tradeRequestedSelections, setTradeRequestedSelections] = useState<Record<string, number>>({});
  const [tradeModalSearch, setTradeModalSearch] = useState<string>('');
  const [tradeNote, setTradeNote] = useState<string>('');
  const [submittingTrade, setSubmittingTrade] = useState(false);

  // 申請先（受信側）による相手資産確認＆返答オファーモーダルステート
  const [counterTradeTarget, setCounterTradeTarget] = useState<TradeRequestItem | null>(null);
  const [senderAssetCounts, setSenderAssetCounts] = useState<Record<string, number>>({});
  const [loadingSenderAssets, setLoadingSenderAssets] = useState(false);
  const [counterOfferedSelections, setCounterOfferedSelections] = useState<Record<string, number>>({});
  const [counterModalSearch, setCounterModalSearch] = useState<string>('');
  const [counterNote, setCounterNote] = useState<string>('');
  const [submittingCounter, setSubmittingCounter] = useState(false);

  // マイデッキ一覧モーダル
  const [isDeckListOpen, setIsDeckListOpen] = useState(false);
  const [savedDecks, setSavedDecks] = useState<{ id: string; name: string; created_at: string; total_cards: number }[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);

  // 購入リスト枠の開閉状態
  const [isBuyListOpen, setIsBuyListOpen] = useState(true);
  const [copiedDeckList, setCopiedDeckList] = useState(false);

  // ---------------- 一人回しシミュレーターステート ----------------
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simTurn, setSimTurn] = useState<number>(1);
  const [currentPhase, setCurrentPhase] = useState<DuelPhase>('mana');
  const [hasChargedManaThisTurn, setHasChargedManaThisTurn] = useState(false);

  // 墓地確認用モーダル
  const [graveyardModal, setGraveyardModal] = useState<{
    title: string;
    cards: SimCardInstance[];
  } | null>(null);

  // 呪文の対象選択モーダルステート
  const [spellTargetModal, setSpellTargetModal] = useState<{
    spell: SimCardInstance;
    mode: 'bounce' | 'destroy';
  } | null>(null);

  // ホバープレビュー用ステート
  const [hoveredCard, setHoveredCard] = useState<Card | null>(null);

  // プレイヤー盤面
  const [simDeck, setSimDeck] = useState<SimCardInstance[]>([]);
  const [simShields, setSimShields] = useState<SimCardInstance[]>([]);
  const [simHand, setSimHand] = useState<SimCardInstance[]>([]);
  const [simBattleZone, setSimBattleZone] = useState<SimCardInstance[]>([]);
  const [simMana, setSimMana] = useState<SimCardInstance[]>([]);
  const [simGraveyard, setSimGraveyard] = useState<SimCardInstance[]>([]);

  const [simGameMessage, setSimGameMessage] = useState<string | null>(null);

  // 絞り込み条件
  const [searchName, setSearchName] = useState<string>('');
  const [rubyMatchedNames, setRubyMatchedNames] = useState<Set<string>>(new Set());

  const normalizeSearchText = useCallback((str: string) => {
    return str
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
      .replace(/[\s・＝=\-‐―ー〜~()（）「」『』]/g, '');
  }, []);

  useEffect(() => {
    const q = searchName.trim();
    if (!q) {
      setRubyMatchedNames(new Set());
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ruby-search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.files)) {
          setRubyMatchedNames(new Set(data.files.map((f: string) => f.toLowerCase())));
        }
      } catch {
        // 通信失敗時はローカル検索のみで継続
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchName, normalizeSearchText]);
  const [searchRace, setSearchRace] = useState<string>('');
  const [selectedCardType, setSelectedCardType] = useState<string>('all');
  const [selectedSet, setSelectedSet] = useState<string>('all');
  const [selectedCivilization, setSelectedCivilization] = useState<string>('all');
  const [selectedCost, setSelectedCost] = useState<string>('all');
  const [onlyOwned, setOnlyOwned] = useState<boolean>(false);

  const [activeCard, setActiveCard] = useState<Card | null>(null);

  // 認証モーダル
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const loadUserCardCounts = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_cards')
      .select('card_id, count')
      .eq('user_id', userId);

    if (!error && data) {
      const countMap: Record<string, number> = {};
      data.forEach((row) => {
        countMap[row.card_id] = row.count;
      });
      setCounts(countMap);
    }
  }, []);

  const loadSocialData = useCallback(async (currentUser: User) => {
    try {
      setFriendLoading(true);
      let { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (!profile) {
        const defaultName = (currentUser.user_metadata?.display_name as string)?.trim() || (currentUser.email ? currentUser.email.split('@')[0] : 'プレイヤー');
        const { data: inserted, error: insertErr } = await supabase
          .from('profiles')
          .insert({
            id: currentUser.id,
            email: currentUser.email || '',
            display_name: defaultName,
          })
          .select()
          .single();
        if (!insertErr) profile = inserted;
      }
      if (profile) setMyProfile(profile);

      const { data: fData } = await supabase
        .from('friendships')
        .select('*')
        .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

      if (fData && fData.length > 0) {
        const partnerIds = Array.from(
          new Set(fData.map((f) => (f.user_id === currentUser.id ? f.friend_id : f.user_id)))
        );
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', partnerIds);

        const profileMap: Record<string, UserProfile> = {};
        (profilesData || []).forEach((p) => {
          profileMap[p.id] = p;
        });

        const formatted: FriendshipItem[] = fData
          .map((f) => {
            const isIncoming = f.friend_id === currentUser.id;
            const partnerId = isIncoming ? f.user_id : f.friend_id;
            const partner = profileMap[partnerId];
            if (!partner) return null;
            return {
              id: f.id,
              user_id: f.user_id,
              friend_id: f.friend_id,
              status: f.status,
              created_at: f.created_at,
              partner,
              isIncoming,
            };
          })
          .filter(Boolean) as FriendshipItem[];

        setFriendships(formatted);
      } else {
        setFriendships([]);
      }

      const { data: tData } = await supabase
        .from('trade_requests')
        .select('*')
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

      if (tData && tData.length > 0) {
        const userIds = Array.from(
          new Set(tData.flatMap((t) => [t.sender_id, t.receiver_id]))
        );
        const { data: tProfiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', userIds);

        const tProfileMap: Record<string, UserProfile> = {};
        (tProfiles || []).forEach((p) => {
          tProfileMap[p.id] = p;
        });

        setTradeRequests(
          tData.map((t) => ({
            ...t,
            sender: tProfileMap[t.sender_id],
            receiver: tProfileMap[t.receiver_id],
          }))
        );
      } else {
        setTradeRequests([]);
      }
    } finally {
      setFriendLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadUserCardCounts(currentUser.id);
        loadSocialData(currentUser);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        loadUserCardCounts(currentUser.id);
        loadSocialData(currentUser);
      } else {
        setCounts({});
        setMyProfile(null);
        setFriendships([]);
        setTradeRequests([]);
        setSelectedFriend(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [loadUserCardCounts, loadSocialData]);

  // 高速カード読み込み：キャッシュ即時反映 ＋ 初回50件即表示 ＋ 残り並列取得
  useEffect(() => {
    let isCancelled = false;

    async function loadCardsFast() {
      let hasValidCache = false;
      try {
        const rawCache = localStorage.getItem(CARDS_CACHE_KEY);
        if (rawCache) {
          const parsed = JSON.parse(rawCache);
          if (parsed && Array.isArray(parsed.cards) && parsed.cards.length > 0) {
            setCards(parsed.cards);
            setLoading(false);
            if (Date.now() - (parsed.timestamp || 0) < CARDS_CACHE_TTL_MS) {
              hasValidCache = true;
            }
          }
        }
      } catch {
        // キャッシュ破損時は無視してDBから取得
      }

      if (hasValidCache) return;

      try {
        if (!hasValidCache) setIsSyncingAll(true);

        const firstPageRes = await supabase
          .from("cards")
          .select("*")
          .order("sort_order", { ascending: false, nullsFirst: false })
          .order("id", { ascending: true })
          .range(0, CARDS_PER_PAGE - 1);

        if (firstPageRes.error) throw firstPageRes.error;
        if (isCancelled) return;

        const firstBatch = firstPageRes.data || [];
        if (firstBatch.length > 0) {
          setCards((prev) => (prev.length === 0 ? firstBatch : prev));
          setLoading(false);
        }

        const step = 1000;
        let allCards: Card[] = [];
        let from = 0;

        while (true) {
          const { data, error } = await supabase
            .from("cards")
            .select("*")
            .order("sort_order", { ascending: false, nullsFirst: false })
            .order("id", { ascending: true })
            .range(from, from + step - 1);

          if (error) throw error;
          if (isCancelled) return;
          if (!data || data.length === 0) break;

          allCards = allCards.concat(data);
          setCards([...allCards]);
          if (data.length < step) break;
          from += step;
        }

        if (allCards.length > 0) {
          setCards(allCards);
          try {
            localStorage.setItem(
              CARDS_CACHE_KEY,
              JSON.stringify({ timestamp: Date.now(), cards: allCards })
            );
          } catch {
            // ストレージ容量超過時はキャッシュ保存をスキップ
          }
        } else if (firstBatch.length === 0) {
          setCards(DEFAULT_CARDS);
        }
      } catch (err) {
        console.error(err);
        if (!isCancelled) {
          setCards((prev) => (prev.length === 0 ? DEFAULT_CARDS : prev));
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
          setIsSyncingAll(false);
        }
      }
    }

    loadCardsFast();
    return () => {
      isCancelled = true;
    };
  }, []);

  const handleForceRefreshCards = () => {
    try {
      localStorage.removeItem(CARDS_CACHE_KEY);
    } catch {}
    window.location.reload();
  };

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    const query = friendSearchInput.trim();
    if (!query) return;

    try {
      setFriendLoading(true);
      setFriendMessage(null);

      const { data: targetProfile, error: searchErr } = await supabase
        .from('profiles')
        .select('*')
        .or(`friend_code.eq.${query.toUpperCase()},email.eq.${query.toLowerCase()}`)
        .maybeSingle();

      if (searchErr) throw searchErr;
      if (!targetProfile) {
        setFriendMessage({ text: '該当するユーザーが見つかりませんでした。コードやメールアドレスを確認してください。', type: 'error' });
        return;
      }
      if (targetProfile.id === user.id) {
        setFriendMessage({ text: '自分自身にフレンド申請は送れません。', type: 'error' });
        return;
      }

      const already = friendships.find((f) => f.partner.id === targetProfile.id);
      if (already) {
        setFriendMessage({
          text: already.status === 'accepted' ? 'すでにフレンド登録済みです。' : 'すでに申請中または承認待ちです。',
          type: 'error',
        });
        return;
      }

      const { error: insertErr } = await supabase.from('friendships').insert({
        user_id: user.id,
        friend_id: targetProfile.id,
        status: 'pending',
      });

      if (insertErr) throw insertErr;

      setFriendSearchInput('');
      setFriendMessage({ text: `${targetProfile.display_name || targetProfile.email} にフレンド申請を送信しました！`, type: 'success' });
      await loadSocialData(user);
    } catch (err: any) {
      setFriendMessage({ text: err.message || 'フレンド申請に失敗しました。', type: 'error' });
    } finally {
      setFriendLoading(false);
    }
  };

  const handleRespondFriendRequest = async (friendshipId: string, accept: boolean) => {
    if (!user) return;
    try {
      setFriendLoading(true);
      if (accept) {
        await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
        setFriendMessage({ text: 'フレンド申請を承認しました！所持カードが閲覧できるようになりました。', type: 'success' });
      } else {
        await supabase.from('friendships').delete().eq('id', friendshipId);
        setFriendMessage({ text: 'フレンド申請を削除しました。', type: 'success' });
        if (selectedFriend) setSelectedFriend(null);
      }
      await loadSocialData(user);
    } catch (err: any) {
      setFriendMessage({ text: err.message || '操作に失敗しました。', type: 'error' });
    } finally {
      setFriendLoading(false);
    }
  };

  const handleSelectFriend = async (partner: UserProfile) => {
    setSelectedFriend(partner);
    setLoadingFriendCards(true);
    try {
      const { data, error } = await supabase
        .from('user_cards')
        .select('card_id, count')
        .eq('user_id', partner.id)
        .gt('count', 0);

      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((r) => {
        map[r.card_id] = r.count;
      });
      setFriendCardCounts(map);
    } catch (err: any) {
      setFriendMessage({ text: 'フレンドの所持カード取得に失敗しました。', type: 'error' });
    } finally {
      setLoadingFriendCards(false);
    }
  };

  const openTradeModal = (preselectedRequestedCardId?: string) => {
    if (!selectedFriend) return;
    const friendOwnedIds = Object.keys(friendCardCounts).filter((id) => (friendCardCounts[id] || 0) > 0);
    if (friendOwnedIds.length === 0) {
      setFriendMessage({ text: '相手が所持しているカードがありません。', type: 'error' });
      return;
    }
    const initialSelections: Record<string, number> = {};
    if (preselectedRequestedCardId && friendOwnedIds.includes(preselectedRequestedCardId)) {
      initialSelections[preselectedRequestedCardId] = 1;
    }
    setTradeRequestedSelections(initialSelections);
    setTradeModalSearch('');
    setTradeNote('');
    setIsTradeModalOpen(true);
  };

  const handleSubmitTradeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedFriend) return;
    const items: TradeCardEntry[] = Object.entries(tradeRequestedSelections)
      .filter(([, cnt]) => cnt > 0)
      .map(([card_id, count]) => ({ card_id, count }));

    if (items.length === 0) {
      setFriendMessage({ text: 'ほしいカードを1枚以上選択してください。', type: 'error' });
      return;
    }

    try {
      setSubmittingTrade(true);
      const firstItem = items[0];
      const { error } = await supabase.from('trade_requests').insert({
        sender_id: user.id,
        receiver_id: selectedFriend.id,
        offered_card_id: null,
        offered_count: 0,
        requested_card_id: firstItem.card_id,
        requested_count: firstItem.count,
        requested_items: items,
        offered_items: [],
        message: tradeNote.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      setIsTradeModalOpen(false);
      setFriendMessage({
        text: `${selectedFriend.display_name || selectedFriend.email} にほしいカードのリクエストを送信しました！相手の返答をお待ちください。`,
        type: 'success',
      });
      await loadSocialData(user);
    } catch (err: any) {
      setFriendMessage({ text: err.message || 'トレード申請の送信に失敗しました。', type: 'error' });
    } finally {
      setSubmittingTrade(false);
    }
  };

  const openCounterOfferModal = async (tr: TradeRequestItem) => {
    setCounterTradeTarget(tr);
    setCounterOfferedSelections({});
    setCounterModalSearch('');
    setCounterNote('');
    setLoadingSenderAssets(true);
    try {
      const { data, error } = await supabase
        .from('user_cards')
        .select('card_id, count')
        .eq('user_id', tr.sender_id)
        .gt('count', 0);
      if (error) throw error;
      const map: Record<string, number> = {};
      (data || []).forEach((r) => {
        map[r.card_id] = r.count;
      });
      setSenderAssetCounts(map);
    } catch {
      setFriendMessage({ text: '申請元の所持カード取得に失敗しました。', type: 'error' });
    } finally {
      setLoadingSenderAssets(false);
    }
  };

  const handleSubmitCounterOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !counterTradeTarget) return;
    const offeredItems: TradeCardEntry[] = Object.entries(counterOfferedSelections)
      .filter(([, cnt]) => cnt > 0)
      .map(([card_id, count]) => ({ card_id, count }));

    try {
      setSubmittingCounter(true);
      const firstOffer = offeredItems[0] || null;
      const { error } = await supabase
        .from('trade_requests')
        .update({
          offered_card_id: firstOffer ? firstOffer.card_id : null,
          offered_count: firstOffer ? firstOffer.count : 0,
          offered_items: offeredItems,
          counter_message: counterNote.trim() || null,
          status: 'countered',
        })
        .eq('id', counterTradeTarget.id);
      if (error) throw error;
      setCounterTradeTarget(null);
      setFriendMessage({
        text: offeredItems.length > 0
          ? '見返りにほしいカードを連絡しました！申請元の合意をお待ちください。'
          : '見返りなし（無記載）で返答を送信しました！申請元の合意をお待ちください。',
        type: 'success',
      });
      await loadSocialData(user);
    } catch (err: any) {
      setFriendMessage({ text: err.message || '返答の送信に失敗しました。', type: 'error' });
    } finally {
      setSubmittingCounter(false);
    }
  };

  const handleRespondTradeRequest = async (tradeId: string, action: 'accept' | 'reject' | 'cancel') => {
    if (!user) return;
    try {
      setFriendLoading(true);
      setFriendMessage(null);
      if (action === 'accept') {
        const { error } = await supabase.rpc('accept_trade_request', { trade_id: tradeId });
        if (error) throw error;
        setFriendMessage({ text: '🎉 トレードに合意し成立しました！双方の所持カード枚数が更新されました。', type: 'success' });
        await loadUserCardCounts(user.id);
        if (selectedFriend) await handleSelectFriend(selectedFriend);
      } else {
        const newStatus = action === 'reject' ? 'rejected' : 'cancelled';
        const { error } = await supabase
          .from('trade_requests')
          .update({ status: newStatus })
          .eq('id', tradeId);
        if (error) throw error;
        setFriendMessage({
          text: action === 'reject' ? 'トレード申請を辞退しました。' : 'トレード申請を取り消しました。',
          type: 'success',
        });
      }
      await loadSocialData(user);
    } catch (err: any) {
      setFriendMessage({ text: err.message || 'トレード処理に失敗しました。', type: 'error' });
    } finally {
      setFriendLoading(false);
    }
  };

  const pendingNotificationCount = useMemo(() => {
    const incomingFriends = friendships.filter((f) => f.status === 'pending' && f.isIncoming).length;
    const actionRequiredTrades = tradeRequests.filter(
      (t) =>
        (t.status === 'pending' && t.receiver_id === user?.id) ||
        (t.status === 'countered' && t.sender_id === user?.id)
    ).length;
    return incomingFriends + actionRequiredTrades;
  }, [friendships, tradeRequests, user]);

  const displayedFriendCards = useMemo(() => {
    return cards
      .filter((c) => {
        const fCount = friendCardCounts[c.id] || 0;
        if (fCount <= 0) return false;
        if (friendOnlyUnownedByMe && (counts[c.id] || 0) > 0) return false;
        return true;
      })
      .sort((a, b) => (a.cost || 0) - (b.cost || 0));
  }, [cards, friendCardCounts, counts, friendOnlyUnownedByMe]);

  const totalDeckCardCount = useMemo(() => {
    return Object.values(deckCards).reduce((acc, cur) => acc + cur, 0);
  }, [deckCards]);

  const flattenedDeckCards = useMemo(() => {
    const list: Card[] = [];
    Object.entries(deckCards).forEach(([cardId, count]) => {
      const card = cards.find((c) => c.id === cardId);
      if (card) {
        for (let i = 0; i < count; i++) list.push(card);
      }
    });
    return list.sort((a, b) => (a.cost || 0) - (b.cost || 0));
  }, [deckCards, cards]);

  const ownershipData = useMemo(() => {
    let ownedInDeckCount = 0;
    const missingCards: { card: Card; needed: number; owned: number; missing: number }[] = [];

    Object.entries(deckCards).forEach(([cardId, needed]) => {
      const card = cards.find((c) => c.id === cardId);
      if (!card) return;
      const owned = counts[cardId] || 0;
      ownedInDeckCount += Math.min(needed, owned);
      if (needed > owned) {
        missingCards.push({ card, needed, owned, missing: needed - owned });
      }
    });

    const percentage = totalDeckCardCount > 0 ? Math.round((ownedInDeckCount / totalDeckCardCount) * 100) : 100;
    return {
      ownedInDeckCount,
      percentage,
      missingCards: missingCards.sort((a, b) => (a.card.cost || 0) - (b.card.cost || 0)),
    };
  }, [deckCards, cards, counts, totalDeckCardCount]);

  const manaCurve = useMemo(() => {
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    Object.entries(deckCards).forEach(([cardId, count]) => {
      const card = cards.find((c) => c.id === cardId);
      if (card && card.cost) {
        const costKey = card.cost >= 7 ? 7 : card.cost;
        distribution[costKey] = (distribution[costKey] || 0) + count;
      }
    });
    return distribution;
  }, [deckCards, cards]);

  const availableSetNames = useMemo(() => {
    const setNames = new Set<string>();
    cards.forEach((c) => {
      if (c.set_name && c.set_name.trim().length > 0) setNames.add(c.set_name);
    });
    return Array.from(setNames).sort();
  }, [cards]);

  const availableCardTypes = useMemo(() => {
    const types = new Set<string>(['クリーチャー', '呪文', 'クロスギア', '城']);
    cards.forEach((c) => {
      if (c.card_type && c.card_type.trim().length > 0) types.add(c.card_type.trim());
    });
    return Array.from(types);
  }, [cards]);

  const isFilterActive = useMemo(() => {
    return (
      searchName.trim() !== '' ||
      searchRace.trim() !== '' ||
      selectedCardType !== 'all' ||
      selectedSet !== 'all' ||
      selectedCivilization !== 'all' ||
      selectedCost !== 'all' ||
      onlyOwned === true
    );
  }, [searchName, searchRace, selectedCardType, selectedSet, selectedCivilization, selectedCost, onlyOwned]);

  const resetFilters = () => {
    setSearchName('');
    setSearchRace('');
    setSelectedCardType('all');
    setSelectedSet('all');
    setSelectedCivilization('all');
    setSelectedCost('all');
    setOnlyOwned(false);
    setCurrentPage(1);
  };

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (searchName.trim()) {
        const q = normalizeSearchText(searchName.trim());
        const targetName = normalizeSearchText(card.name || '');
        const targetRuby = normalizeSearchText(card.ruby || '');
        const imgFile = (card.image_url || '').split('/').pop()?.split('?')[0].toLowerCase() || '';
        if (!targetName.includes(q) && !targetRuby.includes(q) && !(imgFile && rubyMatchedNames.has(imgFile))) return false;
      }
      if (searchRace && !(card.race || []).some((r) => r.toLowerCase().includes(searchRace.toLowerCase()))) return false;
      if (selectedCardType !== 'all' && (!card.card_type || !card.card_type.includes(selectedCardType))) return false;
      if (selectedSet !== 'all' && card.set_name !== selectedSet) return false;
      if (selectedCivilization !== 'all' && !card.civilization.includes(selectedCivilization)) return false;
      if (selectedCost !== 'all') {
        const costNum = parseInt(selectedCost, 10);
        if (costNum === 10 ? (card.cost || 0) < 10 : card.cost !== costNum) return false;
      }
      if (onlyOwned && (counts[card.id] || 0) === 0) return false;
      return true;
    });
  }, [cards, counts, searchName, searchRace, selectedCardType, selectedSet, selectedCivilization, selectedCost, onlyOwned, normalizeSearchText, rubyMatchedNames]);

  // 検索条件が変わったら1ページ目に戻す（初回マウント時は保存済みページ番号を優先）
  useEffect(() => {
    if (isInitialFilterMount.current) {
      isInitialFilterMount.current = false;
      return;
    }
    setCurrentPage(1);
  }, [searchName, searchRace, selectedCardType, selectedSet, selectedCivilization, selectedCost, onlyOwned]);

  // ページネーション計算
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / CARDS_PER_PAGE));

  const paginatedCards = useMemo(() => {
    const startIdx = (currentPage - 1) * CARDS_PER_PAGE;
    return filteredCards.slice(startIdx, startIdx + CARDS_PER_PAGE);
  }, [filteredCards, currentPage]);

  const visiblePageNumbers = useMemo(() => {
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    let start = Math.max(1, currentPage - 2);
    let end = start + maxVisible - 1;
    if (end > totalPages) {
      end = totalPages;
      start = Math.max(1, end - maxVisible + 1);
    }
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  const handlePageChange = (targetPage: number) => {
    const clamped = Math.min(Math.max(1, targetPage), totalPages);
    setCurrentPage(clamped);
    if (cardListTopRef.current) {
      cardListTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const persistCountToDB = async (cardId: string, newCount: number) => {
    if (!user) return;
    await supabase.from('user_cards').upsert(
      { user_id: user.id, card_id: cardId, count: newCount },
      { onConflict: 'user_id,card_id' }
    );
  };

  const updateCount = (cardId: string, delta: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    const current = counts[cardId] || 0;
    const next = Math.max(0, current + delta);
    setCounts((prev) => ({ ...prev, [cardId]: next }));
    persistCountToDB(cardId, next);
  };

  const addCardToDeck = (card: Card) => {
    const cur = deckCards[card.id] || 0;
    if (totalDeckCardCount >= MAX_DECK_LIMIT) {
      setDeckMessage({ text: `デッキは最大${MAX_DECK_LIMIT}枚までです。`, type: 'error' });
      return;
    }
    if (cur >= 4) {
      setDeckMessage({ text: '同名カードは4枚までしか入れられません。', type: 'error' });
      return;
    }
    setDeckCards((prev) => ({ ...prev, [card.id]: cur + 1 }));
    setDeckMessage(null);
  };

  const removeCardFromDeck = (cardId: string) => {
    const cur = deckCards[cardId] || 0;
    if (cur <= 1) {
      const next = { ...deckCards };
      delete next[cardId];
      setDeckCards(next);
    } else {
      setDeckCards((prev) => ({ ...prev, [cardId]: cur - 1 }));
    }
    setDeckMessage(null);
  };

  const clearDeck = () => {
    setDeckCards({});
    setDeckMessage(null);
  };

  const startNewDeck = () => {
    setCurrentDeckId(null);
    setDeckName('新規デッキ');
    setDeckCards({});
    setDeckMessage(null);
  };

  const saveDeckToDB = async () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (totalDeckCardCount === 0) {
      setDeckMessage({ text: 'デッキにカードが1枚も入っていません。', type: 'error' });
      return;
    }
    try {
      setDeckSaving(true);
      let targetDeckId = currentDeckId;
      if (targetDeckId) {
        await supabase.from('decks').update({ name: deckName, updated_at: new Date().toISOString() }).eq('id', targetDeckId);
        await supabase.from('deck_cards').delete().eq('deck_id', targetDeckId);
      } else {
        const { data: deck, error } = await supabase.from('decks').insert({ user_id: user.id, name: deckName }).select().single();
        if (error) throw error;
        targetDeckId = deck.id;
        setCurrentDeckId(deck.id);
      }
      const records = Object.entries(deckCards).map(([cardId, count]) => ({
        deck_id: targetDeckId!,
        card_id: cardId,
        count,
      }));
      await supabase.from('deck_cards').insert(records);
      setDeckMessage({
        text: totalDeckCardCount >= BASE_DECK_LIMIT
          ? `デッキ「${deckName}」を保存しました（${totalDeckCardCount}枚）！`
          : `下書き保存しました（現在: ${totalDeckCardCount}枚）。`,
        type: 'success',
      });
    } catch (err: any) {
      setDeckMessage({ text: err.message || 'デッキの保存に失敗しました。', type: 'error' });
    } finally {
      setDeckSaving(false);
    }
  };

  const loadSavedDecks = async () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    try {
      setLoadingDecks(true);
      setIsDeckListOpen(true);
      const { data, error } = await supabase
        .from('decks')
        .select(`id, name, created_at, deck_cards (count)`)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setSavedDecks(
        (data || []).map((d: any) => ({
          id: d.id,
          name: d.name,
          created_at: d.created_at,
          total_cards: (d.deck_cards || []).reduce((acc: number, c: any) => acc + (c.count || 0), 0),
        }))
      );
    } finally {
      setLoadingDecks(false);
    }
  };

  const loadDeckToBuilder = async (deckId: string) => {
    try {
      setLoadingDecks(true);
      const { data: deckData, error: deckError } = await supabase
        .from('decks')
        .select('id, name')
        .eq('id', deckId)
        .single();

      if (deckError || !deckData) {
        throw deckError || new Error('デッキが見つかりませんでした。');
      }

      const { data: cardsData, error: cardsError } = await supabase
        .from('deck_cards')
        .select('card_id, count')
        .eq('deck_id', deckId);

      if (cardsError) throw cardsError;

      const cardMap: Record<string, number> = {};
      (cardsData || []).forEach((row) => {
        cardMap[row.card_id] = row.count;
      });

      setCurrentDeckId(deckData.id);
      setDeckName(deckData.name);
      setDeckCards(cardMap);
      setIsDeckListOpen(false);
      setActiveTab('deck');
      setDeckMessage({ text: `「${deckData.name}」を読み込みました。`, type: 'success' });
    } catch (err: any) {
      console.error(err);
      setDeckMessage({ text: err.message || 'デッキの読み込みに失敗しました。', type: 'error' });
    } finally {
      setLoadingDecks(false);
    }
  };

  const handleCopyDeckRecipe = () => {
    if (totalDeckCardCount === 0) return;
    const sorted = Object.entries(deckCards).map(([cardId, count]) => {
      const card = cards.find((c) => c.id === cardId);
      return { name: card?.name || '不明なカード', cost: card?.cost || 0, count };
    }).sort((a, b) => a.cost - b.cost);
    const content = `【${deckName}】(${totalDeckCardCount}枚)\n` + sorted.map((s) => `${s.count} x ${s.name}`).join('\n');
    navigator.clipboard.writeText(content);
    setCopiedDeckList(true);
    setTimeout(() => setCopiedDeckList(false), 2000);
  };

  const exportDeckAsImage = async () => {
    if (totalDeckCardCount === 0) return;
    try {
      setIsExportingImage(true);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const cols = 8;
      const rows = Math.ceil(Math.max(40, flattenedDeckCards.length) / cols);
      const cardW = 120, cardH = 168, gap = 12, paddingX = 40, headerH = 100, paddingBottom = 40;
      canvas.width = paddingX * 2 + cols * cardW + (cols - 1) * gap;
      canvas.height = headerH + rows * cardH + (rows - 1) * gap + paddingBottom;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(`【${deckName}】(${totalDeckCardCount}枚)`, paddingX, 55);

      const downloadLink = document.createElement('a');
      downloadLink.download = `${deckName.replace(/\s+/g, '_')}_recipe.png`;
      downloadLink.href = canvas.toDataURL();
      downloadLink.click();
    } finally {
      setIsExportingImage(false);
    }
  };

  // ---------------- 一人回しシミュレーター開始 ----------------
  const startSimulator = () => {
    if (flattenedDeckCards.length === 0) {
      setDeckMessage({ text: '一人回しを開始するには最低1枚以上のカードが必要です。', type: 'error' });
      return;
    }
    const playerInstances: SimCardInstance[] = flattenedDeckCards.map((c, i) => ({
      instanceId: `p-${c.id}-${i}-${Math.random()}`,
      card: c,
      isTapped: false,
      summonedTurn: 0,
    }));
    for (let i = playerInstances.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerInstances[i], playerInstances[j]] = [playerInstances[j], playerInstances[i]];
    }

    setSimTurn(1);
    setCurrentPhase('mana');
    setHasChargedManaThisTurn(false);
    setHoveredCard(null);
    setSpellTargetModal(null);
    setGraveyardModal(null);

    setSimShields(playerInstances.slice(0, 5));
    setSimHand(playerInstances.slice(5, 10));
    setSimDeck(playerInstances.slice(10));
    setSimBattleZone([]);
    setSimMana([]);
    setSimGraveyard([]);

    setSimGameMessage(`一人回し開始！手札5枚・シールド5枚でスタートします（ターン1はドローなし）。`);
    setIsSimulatorOpen(true);
  };

  // ---------------- 呪文詠唱の解決ロジック ----------------
  const castSpell = (spellInstance: SimCardInstance) => {
    setSimHand((prev) => prev.filter((c) => c.instanceId !== spellInstance.instanceId));
    setSimGraveyard((prev) => [spellInstance, ...prev]);

    const card = spellInstance.card;
    const effectText = card.effect || '';

    if (
      card.name.includes('フェアリー・ライフ') ||
      effectText.includes('山札の上から1枚目をマナゾーンに置く') ||
      effectText.includes('山札の上から1枚目を、自分のマナゾーンに置く')
    ) {
      if (simDeck.length > 0) {
        const topCard = simDeck[0];
        setSimDeck((prev) => prev.slice(1));
        setSimMana((prev) => [...prev, { ...topCard, isTapped: false }]);
        setSimGameMessage(`⚡ 呪文詠唱！「${card.name}」の効果で山札から「${topCard.card.name}」をマナチャージしました！`);
      } else {
        setSimGameMessage(`⚡ 呪文詠唱！「${card.name}」を唱えましたが山札がありませんでした。`);
      }
      return;
    }

    if (card.name.includes('スパイラル・ゲート') || effectText.includes('手札に戻す')) {
      if (simBattleZone.length === 0) {
        setSimGameMessage(`⚡ 呪文詠唱！「${card.name}」を唱えました（バトルゾーンに対象なし）。`);
        return;
      }
      setSpellTargetModal({ spell: spellInstance, mode: 'bounce' });
      setSimGameMessage(`⚡ 「${card.name}」の手札に戻すクリーチャーを選択してください。`);
      return;
    }

    if (effectText.includes('破壊する')) {
      if (simBattleZone.length === 0) {
        setSimGameMessage(`⚡ 呪文詠唱！「${card.name}」を唱えました（バトルゾーンに対象なし）。`);
        return;
      }
      setSpellTargetModal({ spell: spellInstance, mode: 'destroy' });
      setSimGameMessage(`⚡ 「${card.name}」の破壊するクリーチャーを選択してください。`);
      return;
    }

    setSimGameMessage(`⚡ 呪文詠唱！「${card.name}」を唱えて墓地に置きました。`);
  };

  const resolveSpellTarget = (targetInstance: SimCardInstance) => {
    if (!spellTargetModal) return;
    const { spell, mode } = spellTargetModal;

    if (mode === 'bounce') {
      setSimBattleZone((prev) => prev.filter((c) => c.instanceId !== targetInstance.instanceId));
      setSimHand((prev) => [...prev, targetInstance]);
      setSimGameMessage(`🌊 「${spell.card.name}」の効果で「${targetInstance.card.name}」を手札に戻しました！`);
    } else if (mode === 'destroy') {
      setSimBattleZone((prev) => prev.filter((c) => c.instanceId !== targetInstance.instanceId));
      setSimGraveyard((prev) => [targetInstance, ...prev]);
      setSimGameMessage(`💥 「${spell.card.name}」の効果で「${targetInstance.card.name}」を破壊しました！`);
    }

    setSpellTargetModal(null);
  };

  const advancePlayerPhase = () => {
    switch (currentPhase) {
      case 'untap':
        setSimBattleZone((prev) => prev.map((c) => ({ ...c, isTapped: false })));
        setSimMana((prev) => prev.map((c) => ({ ...c, isTapped: false })));
        setCurrentPhase('draw');
        setSimGameMessage('アンタップ完了。ドローフェイズへ進みます。');
        break;
      case 'draw':
        if (simDeck.length > 0) {
          const drawn = simDeck[0];
          setSimDeck((d) => d.slice(1));
          setSimHand((h) => [...h, drawn]);
          setSimGameMessage(`ドロー：+${drawn.card.name}`);
        } else {
          setSimGameMessage('山札が0枚です！');
        }
        setCurrentPhase('mana');
        break;
      case 'mana':
        setCurrentPhase('main');
        setSimGameMessage('メインフェイズ：クリーチャー召喚や呪文の詠唱が可能です。');
        break;
      case 'main':
        setCurrentPhase('battle');
        setSimGameMessage('バトルフェイズ：クリーチャーをクリックして攻撃（タップ）できます。');
        break;
      case 'battle':
        setCurrentPhase('end');
        setSimGameMessage('エンドフェイズ：「次のターンへ」を押すとアンタップ＆1ドローを行います。');
        break;
      case 'end': {
        const nextTurn = simTurn + 1;
        setSimTurn(nextTurn);
        setHasChargedManaThisTurn(false);
        setSimBattleZone((bz) => bz.map((c) => ({ ...c, isTapped: false })));
        setSimMana((m) => m.map((c) => ({ ...c, isTapped: false })));
        if (simDeck.length > 0) {
          const drawn = simDeck[0];
          setSimDeck((d) => d.slice(1));
          setSimHand((h) => [...h, drawn]);
          setSimGameMessage(`ターン ${nextTurn} 開始：カードをアンタップし、1枚ドロー（+${drawn.card.name}）。`);
        } else {
          setSimGameMessage(`ターン ${nextTurn} 開始：カードをアンタップしました（山札なし）。`);
        }
        setCurrentPhase('mana');
        break;
      }
    }
  };

  const chargePlayerMana = (instanceId: string) => {
    const target = simHand.find((c) => c.instanceId === instanceId);
    if (!target) return;
    setSimHand((prev) => prev.filter((c) => c.instanceId !== instanceId));
    setSimMana((prev) => [...prev, { ...target, isTapped: false }]);
    setHasChargedManaThisTurn(true);
    setSimGameMessage(`「${target.card.name}」をマナチャージしました。`);
  };

  const toggleBattleZoneTap = (instanceId: string) => {
    setSimBattleZone((prev) =>
      prev.map((c) => {
        if (c.instanceId === instanceId) {
          const nextTap = !c.isTapped;
          setSimGameMessage(
            nextTap
              ? `⚔️ 「${c.card.name}」で攻撃（タップ）しました！`
              : `🔄 「${c.card.name}」をアンタップしました。`
          );
          return { ...c, isTapped: nextTap };
        }
        return c;
      })
    );
  };

  const toggleManaTap = (instanceId: string) => {
    setSimMana((prev) =>
      prev.map((m) => (m.instanceId === instanceId ? { ...m, isTapped: !m.isTapped } : m))
    );
  };

  const manualDrawOne = () => {
    if (simDeck.length === 0) {
      setSimGameMessage('山札がありません。');
      return;
    }
    const drawn = simDeck[0];
    setSimDeck((d) => d.slice(1));
    setSimHand((h) => [...h, drawn]);
    setSimGameMessage(`山札から1枚ドローしました（+${drawn.card.name}）。`);
  };

  const breakOwnShield = (shieldInstance: SimCardInstance) => {
    setSimShields((prev) => prev.filter((s) => s.instanceId !== shieldInstance.instanceId));
    setSimHand((prev) => [...prev, shieldInstance]);
    setSimGameMessage(`🛡️ シールド「${shieldInstance.card.name}」を手札に加えました！`);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 pb-12">
      {/* ---------------- トレード申請モーダル（1段階目） ---------------- */}
      {isTradeModalOpen && selectedFriend && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 cursor-default"
          onClick={() => setIsTradeModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative space-y-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b shrink-0">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-blue-600" />
                <div>
                  <h3 className="font-black text-base text-slate-800">
                    {selectedFriend.display_name || selectedFriend.email} へトレード申請
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    ほしいカードと枚数を選択して送信してください（見返りは相手があなたの資産を見て連絡します）
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setIsTradeModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTradeRequest} className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div className="shrink-0">
                <input
                  type="text"
                  value={tradeModalSearch}
                  onChange={(e) => setTradeModalSearch(e.target.value)}
                  placeholder="相手の所持カード名で絞り込み..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex-1 overflow-y-auto border border-emerald-200 rounded-2xl bg-emerald-50/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-emerald-900">
                    相手の所持カードからほしいカードを選択（複数種・複数枚可）
                  </span>
                  <span className="text-xs font-black text-emerald-700">
                    選択合計: {Object.values(tradeRequestedSelections).reduce((a, b) => a + b, 0)} 枚
                  </span>
                </div>

                <div className="space-y-1.5">
                  {cards
                    .filter((c) => (friendCardCounts[c.id] || 0) > 0)
                    .filter((c) => !tradeModalSearch.trim() || c.name.toLowerCase().includes(tradeModalSearch.trim().toLowerCase()))
                    .map((c) => {
                      const maxAvail = friendCardCounts[c.id] || 0;
                      const selectedCnt = tradeRequestedSelections[c.id] || 0;
                      return (
                        <div
                          key={c.id}
                          className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition ${
                            selectedCnt > 0 ? 'bg-emerald-100/80 border-emerald-400' : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {c.image_url && (
                              <img src={c.image_url} alt={c.name} className="w-8 h-11 object-cover rounded shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-slate-800 truncate">{c.name}</p>
                              <p className="text-[10px] text-slate-500">相手所持: {maxAvail}枚 / 自分所持: {counts[c.id] || 0}枚</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setTradeRequestedSelections((prev) => ({
                                  ...prev,
                                  [c.id]: Math.max(0, (prev[c.id] || 0) - 1),
                                }))
                              }
                              disabled={selectedCnt === 0}
                              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 font-black text-xs cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-black text-xs text-emerald-800">{selectedCnt}枚</span>
                            <button
                              type="button"
                              onClick={() =>
                                setTradeRequestedSelections((prev) => ({
                                  ...prev,
                                  [c.id]: Math.min(maxAvail, (prev[c.id] || 0) + 1),
                                }))
                              }
                              disabled={selectedCnt >= maxAvail}
                              className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black text-xs cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="space-y-1 shrink-0">
                <label className="text-xs font-bold text-slate-600 block">メッセージ（任意）</label>
                <input
                  type="text"
                  value={tradeNote}
                  onChange={(e) => setTradeNote(e.target.value)}
                  placeholder="例：こちらのカードを探しています！こちらの資産から希望があれば教えてください"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={submittingTrade || Object.values(tradeRequestedSelections).reduce((a, b) => a + b, 0) === 0}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-black rounded-2xl text-xs transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                {submittingTrade ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                選択したカード（{Object.values(tradeRequestedSelections).reduce((a, b) => a + b, 0)}枚）で申請を送る
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- 申請先による相手資産確認＆返答オファーモーダル（2段階目） ---------------- */}
      {counterTradeTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 cursor-default"
          onClick={() => setCounterTradeTarget(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative space-y-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b shrink-0">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-indigo-600" />
                <div>
                  <h3 className="font-black text-base text-slate-800">
                    {counterTradeTarget.sender?.display_name || counterTradeTarget.sender?.email} の資産確認＆返答
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    相手の所持カードから見返りにほしいカードを選択して連絡できます（無記載＝0枚でも送信可能）
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setCounterTradeTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-1 shrink-0">
              <span className="font-black text-amber-900 block">相手が希望しているカード（あなたが渡すカード）：</span>
              <div className="flex flex-wrap gap-1.5">
                {(counterTradeTarget.requested_items && counterTradeTarget.requested_items.length > 0
                  ? counterTradeTarget.requested_items
                  : [{ card_id: counterTradeTarget.requested_card_id, count: counterTradeTarget.requested_count }]
                ).map((item, idx) => {
                  const c = cards.find((card) => card.id === item.card_id);
                  return (
                    <span key={idx} className="px-2 py-0.5 rounded-lg bg-white border border-amber-300 font-bold text-amber-950">
                      {c?.name || item.card_id} ×{item.count}
                    </span>
                  );
                })}
              </div>
            </div>

            <form onSubmit={handleSubmitCounterOffer} className="space-y-4 flex-1 flex flex-col overflow-hidden">
              <div className="shrink-0">
                <input
                  type="text"
                  value={counterModalSearch}
                  onChange={(e) => setCounterModalSearch(e.target.value)}
                  placeholder="申請元の所持カード名で絞り込み..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex-1 overflow-y-auto border border-blue-200 rounded-2xl bg-blue-50/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-blue-900">
                    申請元の所持カード一覧（見返りにほしいカードを選択 / 0枚＝無記載も可）
                  </span>
                  <span className="text-xs font-black text-blue-700">
                    選択合計: {Object.values(counterOfferedSelections).reduce((a, b) => a + b, 0)} 枚
                  </span>
                </div>

                {loadingSenderAssets ? (
                  <div className="text-center py-10 text-xs text-slate-400">申請元の資産を読み込み中...</div>
                ) : Object.keys(senderAssetCounts).length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400">
                    申請元が登録している所持カードがありません（このまま「無記載」で返答することもできます）。
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {cards
                      .filter((c) => (senderAssetCounts[c.id] || 0) > 0)
                      .filter((c) => !counterModalSearch.trim() || c.name.toLowerCase().includes(counterModalSearch.trim().toLowerCase()))
                      .map((c) => {
                        const maxAvail = senderAssetCounts[c.id] || 0;
                        const selectedCnt = counterOfferedSelections[c.id] || 0;
                        return (
                          <div
                            key={c.id}
                            className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition ${
                              selectedCnt > 0 ? 'bg-blue-100/80 border-blue-400' : 'bg-white border-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {c.image_url && (
                                <img src={c.image_url} alt={c.name} className="w-8 h-11 object-cover rounded shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="font-bold text-xs text-slate-800 truncate">{c.name}</p>
                                <p className="text-[10px] text-slate-500">相手所持: {maxAvail}枚 / 自分所持: {counts[c.id] || 0}枚</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setCounterOfferedSelections((prev) => ({
                                    ...prev,
                                    [c.id]: Math.max(0, (prev[c.id] || 0) - 1),
                                  }))
                                }
                                disabled={selectedCnt === 0}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 font-black text-xs cursor-pointer"
                              >
                                -
                              </button>
                              <span className="w-8 text-center font-black text-xs text-blue-800">{selectedCnt}枚</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setCounterOfferedSelections((prev) => ({
                                    ...prev,
                                    [c.id]: Math.min(maxAvail, (prev[c.id] || 0) + 1),
                                  }))
                                }
                                disabled={selectedCnt >= maxAvail}
                                className="w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-black text-xs cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className="space-y-1 shrink-0">
                <label className="text-xs font-bold text-slate-600 block">返答メッセージ（任意）</label>
                <input
                  type="text"
                  value={counterNote}
                  onChange={(e) => setCounterNote(e.target.value)}
                  placeholder="例：こちらのカードと交換でどうでしょうか？ / 無償で大丈夫です！"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={submittingCounter}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                {submittingCounter ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {Object.values(counterOfferedSelections).reduce((a, b) => a + b, 0) > 0
                  ? `ほしいカード（${Object.values(counterOfferedSelections).reduce((a, b) => a + b, 0)}枚）を連絡する`
                  : '見返りなし（無記載）で返答を送信する'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- 墓地一覧確認モーダル ---------------- */}
      {graveyardModal && (
        <div
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-default animate-in fade-in duration-150"
          onClick={() => setGraveyardModal(null)}
        >
          <div
            className="bg-slate-900 border-2 border-purple-500/80 text-white rounded-3xl max-w-xl w-full p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <Skull className="h-5 w-5 text-purple-400" />
                <h3 className="font-black text-sm">{graveyardModal.title}（{graveyardModal.cards.length}枚）</h3>
              </div>
              <button
                type="button"
                onClick={() => setGraveyardModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 pr-1">
              {graveyardModal.cards.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-500">墓地にカードはありません。</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {graveyardModal.cards.map((c, idx) => (
                    <div
                      key={`${c.instanceId}-${idx}`}
                      onMouseEnter={() => setHoveredCard(c.card)}
                      onMouseLeave={() => setHoveredCard(null)}
                      className="p-1.5 bg-slate-950 border border-slate-800 hover:border-purple-400 rounded-xl cursor-pointer transition flex flex-col items-center gap-1 group"
                    >
                      <div className="aspect-[3/4] w-full rounded overflow-hidden bg-slate-900">
                        {c.card.image_url ? (
                          <img src={c.card.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                        ) : null}
                      </div>
                      <span className="text-[8px] font-bold truncate w-full text-center">{c.card.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 呪文の対象選択モーダル ---------------- */}
      {spellTargetModal && (
        <div
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-default animate-in fade-in duration-150"
          onClick={() => setSpellTargetModal(null)}
        >
          <div
            className="bg-slate-900 border-2 border-cyan-500/80 text-white rounded-3xl max-w-xl w-full p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-cyan-400" />
                <h3 className="font-black text-sm">
                  「{spellTargetModal.spell.card.name}」の対象クリーチャーを選択
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSpellTargetModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              {spellTargetModal.mode === 'bounce'
                ? '手札に戻すクリーチャーを1体選択してください：'
                : '破壊するクリーチャーを1体選択してください：'}
            </p>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-blue-400">【バトルゾーンのクリーチャー】</span>
              {simBattleZone.length === 0 ? (
                <div className="text-xs text-slate-500 p-2 bg-slate-950 rounded-xl">クリーチャーなし</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {simBattleZone.map((c) => (
                    <div
                      key={c.instanceId}
                      onClick={() => resolveSpellTarget(c)}
                      onMouseEnter={() => setHoveredCard(c.card)}
                      onMouseLeave={() => setHoveredCard(null)}
                      className="p-1.5 bg-slate-950 border border-blue-900/60 hover:border-cyan-400 rounded-xl cursor-pointer transition flex flex-col items-center gap-1 group"
                    >
                      <div className="aspect-[3/4] w-full rounded overflow-hidden bg-slate-900">
                        {c.card.image_url ? (
                          <img src={c.card.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                        ) : null}
                      </div>
                      <span className="text-[8px] font-bold truncate w-full text-center">{c.card.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 一人回しシミュレーター ---------------- */}
      {isSimulatorOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-1 sm:p-3 cursor-default"
          onClick={() => setIsSimulatorOpen(false)}
        >
          <div
            className="bg-slate-950 text-white rounded-3xl max-w-6xl w-full p-3 sm:p-4 shadow-2xl relative h-[96vh] flex flex-col border border-slate-800 justify-between overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-850 shrink-0 flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
                  <Swords className="h-4 w-4 text-white" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-black text-xs">
                    ターン {simTurn}
                  </span>
                  <span className="text-xs font-bold text-slate-200">
                    一人回しテスト（{deckName}）
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={manualDrawOne}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-bold transition cursor-pointer"
                >
                  +1枚ドロー
                </button>

                <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                  {PHASES.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setCurrentPhase(p.key)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                        currentPhase === p.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={advancePlayerPhase}
                    className="ml-1 px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white text-[11px] font-black rounded-lg transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>{currentPhase === 'end' ? '次のターンへ' : '次へ'}</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={startSimulator}
                  title="盤面をリセットしてやり直す"
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsSimulatorOpen(false)}
                  className="p-1 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {simGameMessage && (
              <div className="px-3 py-1.5 my-1 rounded-xl bg-blue-950/80 border border-blue-800 text-blue-200 text-xs font-bold flex items-center justify-between shrink-0">
                <span className="truncate">{simGameMessage}</span>
                <span className="text-[10px] text-blue-400 shrink-0 ml-2">
                  ※場のカードクリックでタップ／アンタップ切替
                </span>
              </div>
            )}

            <div className="flex-1 bg-blue-950/20 border border-blue-900/40 rounded-2xl p-2.5 flex flex-col justify-between overflow-hidden relative gap-2">
              <div className="flex-1 flex flex-col bg-slate-900/70 p-2.5 rounded-2xl border border-slate-800/90 min-h-0">
                <div className="flex items-center justify-between text-[11px] font-bold text-blue-400 mb-1.5 shrink-0">
                  <span>バトルゾーン（{simBattleZone.length}体）</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    カードをクリックするとタップ（攻撃）／アンタップを切り替えます
                  </span>
                </div>

                <div className="flex-1 flex items-center gap-3 overflow-x-auto px-1">
                  {simBattleZone.length === 0 ? (
                    <span className="text-xs text-slate-500 m-auto">
                      メインフェイズに手札からクリーチャーを召喚、または呪文を詠唱してください
                    </span>
                  ) : (
                    simBattleZone.map((c) => (
                      <div key={c.instanceId} className="h-full max-h-44 flex flex-col items-center justify-center gap-1 shrink-0">
                        <div
                          onClick={() => toggleBattleZoneTap(c.instanceId)}
                          onMouseEnter={() => setHoveredCard(c.card)}
                          onMouseLeave={() => setHoveredCard(null)}
                          className={`h-full aspect-[3/4] rounded-xl border-2 overflow-hidden relative cursor-pointer transition-all shadow-lg ${
                            c.isTapped
                              ? 'rotate-90 border-amber-400 mx-4 scale-90'
                              : 'border-slate-700 hover:border-blue-400 hover:scale-105'
                          }`}
                        >
                          {c.card.image_url ? (
                            <img src={c.card.image_url} alt={c.card.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="p-1 text-[9px] text-center flex items-center justify-center h-full">
                              {c.card.name}
                            </div>
                          )}
                          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/85 text-[9px] text-amber-300 font-black">
                            {c.card.power ?? '-'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2 items-center shrink-0">
                <div className="col-span-3 sm:col-span-2 flex gap-1.5 h-24">
                  <div
                    onClick={manualDrawOne}
                    title="クリックで1枚ドロー"
                    className="flex-1 rounded-xl border border-blue-900/70 bg-blue-950/50 hover:border-blue-400 flex flex-col items-center justify-center text-center p-1 cursor-pointer transition"
                  >
                    <DeckIcon className="h-4 w-4 text-blue-400 mb-0.5" />
                    <span className="text-[9px] text-slate-300 font-bold">山札</span>
                    <span className="text-sm font-black leading-tight text-white">{simDeck.length}</span>
                  </div>

                  <div
                    onClick={() => setGraveyardModal({ title: '墓地一覧', cards: simGraveyard })}
                    onMouseEnter={() => simGraveyard.length > 0 && setHoveredCard(simGraveyard[0].card)}
                    onMouseLeave={() => setHoveredCard(null)}
                    title="クリックで墓地一覧を表示"
                    className="flex-1 rounded-xl border border-purple-900/70 bg-purple-950/50 hover:border-purple-400 flex flex-col items-center justify-center text-center p-1 cursor-pointer transition relative overflow-hidden"
                  >
                    {simGraveyard.length > 0 && simGraveyard[0].card.image_url ? (
                      <img src={simGraveyard[0].card.image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                    ) : null}
                    <Skull className="h-4 w-4 text-purple-400 mb-0.5 relative z-10" />
                    <span className="text-[9px] text-slate-300 font-bold relative z-10">墓地</span>
                    <span className="text-sm font-black leading-tight text-white relative z-10">{simGraveyard.length}</span>
                  </div>
                </div>

                <div className="col-span-5 flex flex-col justify-between h-24 bg-slate-900/60 px-2.5 py-1.5 rounded-xl border border-slate-800">
                  <div className="flex justify-between text-[10px] text-emerald-400 font-bold leading-none">
                    <span>マナゾーン（クリックでタップ切替）</span>
                    <span>
                      使用可能: {simMana.filter((c) => !c.isTapped).length} / {simMana.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto h-16 pt-1">
                    {simMana.length === 0 ? (
                      <span className="text-[10px] text-slate-600 m-auto">マナなし</span>
                    ) : (
                      simMana.map((m) => (
                        <div
                          key={m.instanceId}
                          onClick={() => toggleManaTap(m.instanceId)}
                          onMouseEnter={() => setHoveredCard(m.card)}
                          onMouseLeave={() => setHoveredCard(null)}
                          className={`aspect-[3/4] h-full rounded-md border shrink-0 overflow-hidden cursor-pointer transition-all hover:scale-105 hover:border-emerald-400 ${
                            m.isTapped ? 'rotate-90 opacity-45 border-amber-500 mx-1.5' : 'border-emerald-600 bg-slate-800'
                          }`}
                        >
                          {m.card.image_url ? (
                            <img src={m.card.image_url} alt="" className="w-full h-full object-cover" />
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="col-span-4 sm:col-span-5 flex flex-col justify-between h-24 bg-slate-900/60 px-2.5 py-1.5 rounded-xl border border-slate-800">
                  <div className="flex justify-between text-[10px] text-blue-300 font-bold leading-none">
                    <span>シールドゾーン（クリックで手札へ回収）</span>
                    <span>{simShields.length}枚</span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto h-16 pt-1">
                    {simShields.length === 0 ? (
                      <span className="text-[10px] text-slate-600 m-auto">シールド0枚</span>
                    ) : (
                      simShields.map((s, idx) => (
                        <div
                          key={s.instanceId}
                          onClick={() => breakOwnShield(s)}
                          title="クリックしてブレイク（手札に加える）"
                          className="aspect-[3/4] h-full rounded-md border border-blue-800 hover:border-amber-400 bg-gradient-to-br from-blue-950 to-slate-900 shrink-0 flex flex-col items-center justify-center cursor-pointer transition hover:scale-105"
                        >
                          <Shield className="h-4 w-4 text-blue-400" />
                          <span className="text-[9px] font-black mt-0.5">#{idx + 1}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 overflow-x-auto pt-1.5 border-t border-blue-900/40 relative shrink-0">
                <span className="text-[10px] font-bold text-slate-300 shrink-0">手札({simHand.length}):</span>
                {simHand.map((c) => (
                  <div
                    key={c.instanceId}
                    className="w-28 sm:w-32 shrink-0 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col justify-between shadow-md transition-transform hover:-translate-y-1 hover:border-blue-400"
                    onMouseEnter={() => setHoveredCard(c.card)}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <div className="relative aspect-[3/4] bg-slate-950 overflow-hidden cursor-pointer">
                      {c.card.image_url ? (
                        <img src={c.card.image_url} alt={c.card.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="p-1 text-[9px] text-center flex items-center justify-center h-full">
                          {c.card.name}
                        </div>
                      )}
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/85 text-white font-black text-[9px]">
                        ★{c.card.cost ?? '-'}
                      </span>
                    </div>

                    <div className="p-1.5 flex flex-col gap-1 bg-slate-900 border-t border-slate-800">
                      <span className="text-[9px] font-bold truncate block">{c.card.name}</span>
                      <div className="grid grid-cols-2 gap-1">
                        {c.card.card_type === 'クリーチャー' ? (
                          <button
                            type="button"
                            disabled={currentPhase !== 'main'}
                            onClick={() => {
                              setSimHand((h) => h.filter((card) => card.instanceId !== c.instanceId));
                              setSimBattleZone((bz) => [...bz, { ...c, isTapped: false, summonedTurn: simTurn }]);
                              setSimGameMessage(`「${c.card.name}」を召喚しました！`);
                            }}
                            className="py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-[9px] font-bold rounded cursor-pointer"
                          >
                            召喚
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={currentPhase !== 'main'}
                            onClick={() => castSpell(c)}
                            className="py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white text-[9px] font-bold rounded cursor-pointer"
                          >
                            詠唱
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={currentPhase !== 'mana' || hasChargedManaThisTurn}
                          onClick={() => chargePlayerMana(c.instanceId)}
                          className="py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white text-[9px] font-bold rounded cursor-pointer"
                        >
                          マナ
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {hoveredCard && (
                <div className="absolute top-4 right-4 z-40 bg-slate-900/95 border-2 border-blue-500/80 text-white p-3 rounded-2xl shadow-2xl backdrop-blur-md max-w-sm flex gap-3 pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                  <div className="w-28 aspect-[5/7] rounded-lg overflow-hidden border border-slate-700 bg-slate-950 shrink-0">
                    {hoveredCard.image_url ? (
                      <img src={hoveredCard.image_url} alt={hoveredCard.name} className="w-full h-full object-contain" />
                    ) : (
                      <div className="flex items-center justify-center h-full text-[10px] text-slate-500">画像なし</div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5 overflow-hidden">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-black text-xs text-blue-300 truncate">{hoveredCard.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-blue-600 text-white font-extrabold rounded">
                        ★{hoveredCard.cost ?? '-'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-semibold">
                      {hoveredCard.civilization.join('/')} • {hoveredCard.card_type}
                      {hoveredCard.power ? ` • パワー ${hoveredCard.power}` : ''}
                    </div>
                    {hoveredCard.race && hoveredCard.race.length > 0 && (
                      <div className="text-[9px] text-amber-300 font-medium truncate">
                        種族: {hoveredCard.race.join(' / ')}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-200 bg-slate-950/80 p-2 rounded-lg border border-slate-800 leading-relaxed max-h-24 overflow-y-auto whitespace-pre-wrap">
                      {hoveredCard.effect || '通常カード（能力なし）'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 保存済みデッキ一覧モーダル ---------------- */}
      {isDeckListOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 cursor-default"
          onClick={() => setIsDeckListOpen(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold">マイデッキ一覧</h2>
              </div>
              <button type="button" onClick={() => setIsDeckListOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 overflow-y-auto flex-1 space-y-2.5">
              {loadingDecks ? (
                <div className="text-center py-12 text-slate-400 text-sm">デッキを読み込み中...</div>
              ) : savedDecks.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">保存済みのデッキはありません。</div>
              ) : (
                savedDecks.map((deck) => (
                  <div
                    key={deck.id}
                    onClick={() => loadDeckToBuilder(deck.id)}
                    className={`p-3.5 rounded-2xl border transition flex items-center justify-between cursor-pointer hover:border-blue-500 ${
                      currentDeckId === deck.id ? 'border-blue-600 bg-blue-50/70' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-800">{deck.name}</span>
                        {currentDeckId === deck.id && <span className="px-1.5 py-0.5 rounded bg-blue-600 text-white font-bold text-[9px]">編集中</span>}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                        <span>{deck.total_cards}枚</span>
                        <span>{new Date(deck.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 認証モーダル ---------------- */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {}}
      />

      {/* ---------------- ヘッダー ---------------- */}
      <header className="border-b bg-white px-6 py-3.5 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-lg shadow-md">
                DM
              </div>
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                DM Deck Hub
              </span>
            </div>

            <nav className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('collection')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'collection' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                資産管理
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('deck')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'deck' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                デッキ構築
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${totalDeckCardCount >= BASE_DECK_LIMIT ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {totalDeckCardCount}/{MAX_DECK_LIMIT}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    setIsAuthModalOpen(true);
                    return;
                  }
                  setActiveTab('friends');
                }}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer relative ${
                  activeTab === 'friends' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                フレンド・トレード
                {pendingNotificationCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500 text-white font-black animate-pulse">
                    {pendingNotificationCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    setIsAuthModalOpen(true);
                    return;
                  }
                  setActiveTab('settings');
                }}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                設定
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={loadSavedDecks}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-blue-600" />
                  マイデッキ一覧
                </button>
                <span className="text-xs text-slate-600 hidden sm:inline flex items-center gap-1.5 bg-slate-100 py-1.5 px-3 rounded-full font-medium">
                  <UserIcon className="h-3.5 w-3.5 text-slate-500" />
                  {myProfile?.display_name || (user.user_metadata?.display_name as string) || user.email}
                </span>
                <button
                  type="button"
                  onClick={() => supabase.auth.signOut()}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  ログアウト
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm cursor-pointer"
              >
                <LogIn className="h-3.5 w-3.5" />
                ログイン / 新規登録
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ================ タブ3: フレンド・トレード画面 ================ */}
      {activeTab === 'settings' && user ? (
        <SettingsView
          user={user}
          currentDisplayName={myProfile?.display_name || (user.user_metadata?.display_name as string) || ''}
          onProfileUpdated={(newName) => {
            setMyProfile((prev: any) => (prev ? { ...prev, display_name: newName } : { id: user.id, email: user.email, display_name: newName }));
          }}
          onLoggedOut={() => {
            setActiveTab('deck');
          }}
        />
      ) : activeTab === 'friends' ? (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
          {friendMessage && (
            <div
              className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between ${
                friendMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              <span>{friendMessage.text}</span>
              <button type="button" onClick={() => setFriendMessage(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <UserIcon className="h-4 w-4 text-blue-600" />
                    あなたのフレンドコード
                  </span>
                  {myProfile && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(myProfile.friend_code);
                        setCopiedFriendCode(true);
                        setTimeout(() => setCopiedFriendCode(false), 2000);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedFriendCode ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedFriendCode ? 'コピー済' : 'コピー'}
                    </button>
                  )}
                </div>
                <div className="p-3 rounded-2xl bg-slate-900 text-white font-mono text-lg font-black tracking-widest text-center">
                  {myProfile?.friend_code || 'LOADING...'}
                </div>

                <form onSubmit={handleSendFriendRequest} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={friendSearchInput}
                    onChange={(e) => setFriendSearchInput(e.target.value)}
                    placeholder="相手のフレンドコード または メールアドレス"
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="submit"
                    disabled={friendLoading || !friendSearchInput.trim()}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    申請
                  </button>
                </form>
              </div>

              {friendships.some((f) => f.status === 'pending') && (
                <div className="bg-white rounded-3xl border border-amber-200 shadow-sm p-4 space-y-2.5">
                  <h3 className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    承認待ちのフレンド申請
                  </h3>
                  {friendships
                    .filter((f) => f.status === 'pending')
                    .map((f) => (
                      <div key={f.id} className="p-2.5 rounded-2xl bg-amber-50/70 border border-amber-100 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-800 block">{f.partner.display_name || f.partner.email}</span>
                          <span className="text-[10px] text-slate-500">
                            {f.isIncoming ? 'あなた宛の申請' : '相手の承認待ち'}
                          </span>
                        </div>
                        {f.isIncoming ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleRespondFriendRequest(f.id, true)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer"
                            >
                              承認
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRespondFriendRequest(f.id, false)}
                              className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] cursor-pointer"
                            >
                              拒否
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRespondFriendRequest(f.id, false)}
                            className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 text-[10px] font-bold cursor-pointer"
                          >
                            取消
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}

              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-4 space-y-2.5">
                <h3 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-blue-600" />
                  フレンド一覧（{friendships.filter((f) => f.status === 'accepted').length}人）
                </h3>
                {friendships.filter((f) => f.status === 'accepted').length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    まだフレンドがいません。上の検索欄から申請を送ってみましょう！
                  </div>
                ) : (
                  <div className="space-y-2">
                    {friendships
                      .filter((f) => f.status === 'accepted')
                      .map((f) => {
                        const isSelected = selectedFriend?.id === f.partner.id;
                        return (
                          <div
                            key={f.id}
                            onClick={() => handleSelectFriend(f.partner)}
                            className={`p-3 rounded-2xl border transition flex items-center justify-between cursor-pointer ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50/70'
                                : 'border-slate-200 hover:border-blue-400 bg-white'
                            }`}
                          >
                            <div>
                              <span className="font-bold text-xs text-slate-800 block">
                                {f.partner.display_name || f.partner.email}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                ID: {f.partner.friend_code}
                              </span>
                            </div>
                            <span className="px-2.5 py-1 rounded-xl bg-blue-600 text-white text-[10px] font-bold flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              所持カードを見る
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-4 space-y-3">
                <h3 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                  <ArrowLeftRight className="h-4 w-4 text-indigo-600" />
                  トレード申請状況（{tradeRequests.length}件）
                </h3>

                {tradeRequests.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">トレード申請の履歴はありません。</div>
                ) : (
                  <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {tradeRequests.map((tr) => {
                      const isReceiver = tr.receiver_id === user?.id;
                      const partnerName = isReceiver
                        ? tr.sender?.display_name || tr.sender?.email
                        : tr.receiver?.display_name || tr.receiver?.email;

                      const reqItems: TradeCardEntry[] =
                        tr.requested_items && tr.requested_items.length > 0
                          ? tr.requested_items
                          : tr.requested_card_id
                          ? [{ card_id: tr.requested_card_id, count: tr.requested_count }]
                          : [];

                      const offItems: TradeCardEntry[] =
                        tr.offered_items && tr.offered_items.length > 0
                          ? tr.offered_items
                          : tr.offered_card_id && tr.offered_count > 0
                          ? [{ card_id: tr.offered_card_id, count: tr.offered_count }]
                          : [];

                      const needsMyAction =
                        (tr.status === 'pending' && isReceiver) ||
                        (tr.status === 'countered' && !isReceiver);

                      return (
                        <div
                          key={tr.id}
                          className={`p-3 rounded-2xl border text-xs space-y-2 ${
                            needsMyAction
                              ? 'border-indigo-400 bg-indigo-50/60 shadow-xs'
                              : 'border-slate-200 bg-slate-50/70'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-700 truncate">
                              {isReceiver ? `📩 ${partnerName} からの申請` : `📤 ${partnerName} への申請`}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                                tr.status === 'pending'
                                  ? 'bg-amber-100 text-amber-800'
                                  : tr.status === 'countered'
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : tr.status === 'accepted'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {tr.status === 'pending'
                                ? isReceiver
                                  ? '資産確認・返答待ち'
                                  : '相手の確認待ち'
                                : tr.status === 'countered'
                                ? isReceiver
                                  ? '申請元の合意待ち'
                                  : '条件到着・合意待ち'
                                : tr.status === 'accepted'
                                ? '合意・トレード成立'
                                : tr.status === 'rejected'
                                ? '辞退済'
                                : '取消済'}
                            </span>
                          </div>

                          <div className="grid grid-cols-11 items-start gap-1.5 bg-white p-2.5 rounded-xl border border-slate-100">
                            <div className="col-span-5 space-y-0.5">
                              <span className="text-[9px] text-slate-400 block">
                                {isReceiver ? '相手が出すカード（あなたの希望）' : 'あなたが出すカード（相手の希望）'}
                              </span>
                              {tr.status === 'pending' ? (
                                <span className="text-[11px] font-bold text-slate-400">未指定（確認後に連絡）</span>
                              ) : offItems.length === 0 ? (
                                <span className="text-[11px] font-bold text-slate-500">なし（無記載）</span>
                              ) : (
                                offItems.map((item, i) => {
                                  const c = cards.find((card) => card.id === item.card_id);
                                  return (
                                    <span key={i} className="font-bold text-[11px] text-blue-700 block leading-tight">
                                      • {c?.name || item.card_id} ×{item.count}
                                    </span>
                                  );
                                })
                              )}
                            </div>

                            <div className="col-span-1 flex justify-center pt-3">
                              <ArrowLeftRight className="h-3.5 w-3.5 text-slate-400" />
                            </div>

                            <div className="col-span-5 space-y-0.5">
                              <span className="text-[9px] text-slate-400 block">
                                {isReceiver ? 'あなたが渡すカード' : 'あなたが貰うカード'}
                              </span>
                              {reqItems.map((item, i) => {
                                const c = cards.find((card) => card.id === item.card_id);
                                return (
                                  <span key={i} className="font-bold text-[11px] text-emerald-700 block leading-tight">
                                    • {c?.name || item.card_id} ×{item.count}
                                  </span>
                                );
                              })}
                            </div>
                          </div>

                          {tr.message && (
                            <p className="text-[11px] text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-100">
                              💬 申請元: {tr.message}
                            </p>
                          )}

                          {tr.counter_message && (
                            <p className="text-[11px] text-indigo-800 bg-indigo-50/70 px-2.5 py-1.5 rounded-lg border border-indigo-100">
                              ↩️ 申請先: {tr.counter_message}
                            </p>
                          )}

                          {tr.status === 'pending' && (
                            <div className="flex justify-end gap-2 pt-1">
                              {isReceiver ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRespondTradeRequest(tr.id, 'reject')}
                                    className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] cursor-pointer"
                                  >
                                    お断りする
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openCounterOfferModal(tr)}
                                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] cursor-pointer"
                                  >
                                    相手の資産を確認して返答する
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleRespondTradeRequest(tr.id, 'cancel')}
                                  className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] cursor-pointer"
                                >
                                  申請を取り消す
                                </button>
                              )}
                            </div>
                          )}

                          {tr.status === 'countered' && (
                            <div className="flex justify-end gap-2 pt-1">
                              {!isReceiver ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRespondTradeRequest(tr.id, 'cancel')}
                                    className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] cursor-pointer"
                                  >
                                    見送る（取消）
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRespondTradeRequest(tr.id, 'accept')}
                                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] cursor-pointer shadow-xs"
                                  >
                                    この内容に合意して成立させる
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleRespondTradeRequest(tr.id, 'reject')}
                                  className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px] cursor-pointer"
                                >
                                  提案を取り下げる
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-5 min-h-[500px] flex flex-col">
                {!selectedFriend ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 space-y-2 py-20">
                    <Users className="h-10 w-10 text-slate-300" />
                    <p className="text-sm font-bold text-slate-600">左のフレンド一覧からユーザーを選択してください</p>
                    <p className="text-xs">フレンドが所持しているカード一覧を確認し、トレード申請を送ることができます。</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b flex-wrap gap-2">
                      <div>
                        <h2 className="text-base font-black text-slate-800">
                          {selectedFriend.display_name || selectedFriend.email} の所持カード
                        </h2>
                        <p className="text-xs text-slate-500">
                          合計 {Object.values(friendCardCounts).reduce((a, b) => a + b, 0)} 枚所持
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={friendOnlyUnownedByMe}
                            onChange={(e) => setFriendOnlyUnownedByMe(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600"
                          />
                          自分の未所持のみ表示
                        </label>

                        <button
                          type="button"
                          onClick={() => openTradeModal()}
                          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-xl text-xs font-black shadow-sm flex items-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                          トレード申請を作成
                        </button>
                      </div>
                    </div>

                    {loadingFriendCards ? (
                      <div className="text-center py-20 text-xs text-slate-400">フレンドのカードを読み込み中...</div>
                    ) : displayedFriendCards.length === 0 ? (
                      <div className="text-center py-20 text-xs text-slate-400">
                        表示できる所持カードがありません。
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {displayedFriendCards.map((card) => {
                          const friendOwned = friendCardCounts[card.id] || 0;
                          const myOwned = counts[card.id] || 0;
                          return (
                            <div
                              key={card.id}
                              onClick={() => setActiveCard(card)}
                              className="group bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between cursor-pointer"
                            >
                              <div className="relative aspect-[3/4] bg-slate-100 overflow-hidden">
                                {card.image_url ? (
                                  <img
                                    src={card.image_url}
                                    alt={card.name}
                                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                  />
                                ) : (
                                  <div className="text-xs text-slate-400 flex items-center justify-center h-full">画像なし</div>
                                )}
                                <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white font-black text-[10px] shadow-xs">
                                  相手所持: {friendOwned}枚
                                </span>
                                {myOwned === 0 && (
                                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-rose-600 text-white font-black text-[9px] shadow-xs">
                                    自分未所持
                                  </span>
                                )}
                              </div>

                              <div className="p-2 space-y-1.5">
                                <h4 className="font-bold text-xs text-slate-800 line-clamp-1">{card.name}</h4>
                                <div className="flex items-center justify-between text-[10px] text-slate-500">
                                  <span>{card.civilization.join('/')}</span>
                                  <span>自分所持: {myOwned}枚</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openTradeModal(card.id);
                                  }}
                                  className="w-full py-1.5 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold text-[11px] transition flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <ArrowLeftRight className="h-3 w-3" />
                                  このカードを要求
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================ タブ1・2: 資産管理＆デッキ構築画面 ================ */
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section ref={cardListTopRef} className={`${activeTab === 'deck' ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-4 scroll-mt-20`}>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap gap-2.5 items-center">
              <div className="relative flex-1 min-w-[130px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="カード名..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="relative min-w-[110px] flex-1 sm:flex-initial">
                <input
                  type="text"
                  placeholder="種族..."
                  value={searchRace}
                  onChange={(e) => setSearchRace(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <select
                value={selectedCardType}
                onChange={(e) => setSelectedCardType(e.target.value)}
                className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white max-w-[120px] truncate"
              >
                <option value="all">タイプ: 全て</option>
                {availableCardTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <select
                value={selectedSet}
                onChange={(e) => setSelectedSet(e.target.value)}
                className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white max-w-[120px] truncate"
              >
                <option value="all">収録弾: 全て</option>
                {availableSetNames.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              <select
                value={selectedCivilization}
                onChange={(e) => setSelectedCivilization(e.target.value)}
                className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white"
              >
                <option value="all">文明: 全て</option>
                <option value="光">光文明</option>
                <option value="水">水文明</option>
                <option value="闇">闇文明</option>
                <option value="火">火文明</option>
                <option value="自然">自然文明</option>
              </select>

              <select
                value={selectedCost}
                onChange={(e) => setSelectedCost(e.target.value)}
                className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white"
              >
                <option value="all">コスト: 全て</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
                  <option key={c} value={c}>コスト {c}</option>
                ))}
                <option value="10">コスト 10+</option>
              </select>

              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-slate-600 select-none">
                <input
                  type="checkbox"
                  checked={onlyOwned}
                  onChange={(e) => setOnlyOwned(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                所持のみ
              </label>

              <button
                type="button"
                disabled={!isFilterActive}
                onClick={resetFilters}
                title="検索条件をクリア"
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer ml-auto border ${
                  isFilterActive ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100' : 'bg-slate-50 border-slate-200 text-slate-300 opacity-60'
                }`}
              >
                <RotateCcw className="h-3 w-3" />
                条件クリア
              </button>
            </div>

            {loading ? (
              <div className="text-center py-24 text-slate-400 font-medium text-sm flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                カードを読み込み中...
              </div>
            ) : filteredCards.length === 0 ? (
              <div className="text-center py-24 text-slate-400 font-medium text-sm">該当するカードが見つかりません。</div>
            ) : (
              <>
                <div className="text-xs font-bold text-slate-500 px-1 flex items-center justify-between flex-wrap gap-1">
                  <span>
                    該当カード: {filteredCards.length.toLocaleString()} 件（{currentPage} / {totalPages} ページ目・{((currentPage - 1) * CARDS_PER_PAGE + 1).toLocaleString()}〜{Math.min(currentPage * CARDS_PER_PAGE, filteredCards.length).toLocaleString()}件を表示）
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    {isSyncingAll && (
                      <span className="flex items-center gap-1 text-blue-600 font-semibold">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        全データ同期中...
                      </span>
                    )}
                    <span>総登録数: {cards.length.toLocaleString()} 件</span>
                    <button
                      type="button"
                      onClick={handleForceRefreshCards}
                      title="最新データをデータベースから再取得する"
                      className="text-slate-400 hover:text-blue-600 underline cursor-pointer"
                    >
                      最新化
                    </button>
                  </div>
                </div>

                <div className={`grid gap-3 ${activeTab === 'deck' ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-5'}`}>
                  {paginatedCards.map((card) => {
                    const owned = counts[card.id] || 0;
                    const inDeck = deckCards[card.id] || 0;

                    return (
                      <div
                        key={card.id}
                        onClick={() => setActiveCard(card)}
                        className="group bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col justify-between cursor-pointer relative"
                      >
                        <div className="relative aspect-[3/4] bg-slate-100 overflow-hidden">
                          {card.image_url ? (
                            <img
                              src={card.image_url}
                              alt={card.name}
                              loading="lazy"
                              decoding="async"
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            />
                          ) : (
                            <div className="text-xs text-slate-400 flex items-center justify-center h-full">画像なし</div>
                          )}
                          <div className="absolute top-1.5 left-1.5 flex gap-1">
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-900/80 text-white font-bold text-[9px]">{card.rarity || 'Common'}</span>
                            <span className="px-1.5 py-0.5 rounded-md bg-blue-600 text-white font-bold text-[9px]">★{card.cost ?? '-'}</span>
                          </div>
                          {activeTab === 'deck' && inDeck > 0 && (
                            <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded-md bg-emerald-600 text-white font-extrabold text-xs shadow-md">
                              投入: {inDeck}
                            </div>
                          )}
                        </div>

                        <div className="p-2.5 flex flex-col flex-1 justify-between gap-2">
                          <div>
                            <h3 className="font-bold text-xs text-slate-800 line-clamp-1">{card.name}</h3>
                            <div className="flex items-center justify-between mt-1">
                              <p className="text-[10px] text-slate-500">{card.civilization.join('/')} • {card.card_type}</p>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${owned > 0 ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}>
                                所持: {owned}枚
                              </span>
                            </div>
                            {card.race && card.race.length > 0 && (
                              <p className="text-[9px] text-slate-400 truncate mt-0.5">{card.race.join('/')}</p>
                            )}
                          </div>

                          {activeTab === 'collection' ? (
                            <div className="flex items-center justify-between bg-slate-50 p-1.5 rounded-xl border border-slate-100" onClick={(e) => e.stopPropagation()}>
                              <span className="text-[11px] font-bold text-slate-600 pl-1">所持:</span>
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={(e) => updateCount(card.id, -1, e)} className="h-6 w-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition">
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-6 text-center text-xs font-black text-slate-800">{owned}</span>
                                <button type="button" onClick={(e) => updateCount(card.id, 1, e)} className="h-6 w-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition">
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                disabled={inDeck >= 4 || totalDeckCardCount >= MAX_DECK_LIMIT}
                                onClick={() => addCardToDeck(card)}
                                className="w-full py-1.5 px-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center justify-center gap-1 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer shadow-sm"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                デッキに追加
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ページネーションUI */}
                {totalPages > 1 && (
                  <nav aria-label="ページネーション" className="pt-4 pb-2 flex items-center justify-center flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => handlePageChange(1)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold text-slate-700 transition cursor-pointer"
                    >
                      一番最初のページ
                    </button>

                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => handlePageChange(currentPage - 1)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold text-slate-700 transition cursor-pointer"
                    >
                      前のページ
                    </button>

                    {visiblePageNumbers.map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => handlePageChange(pageNum)}
                        className={`min-w-[34px] px-2.5 py-1.5 rounded-xl border text-xs font-black transition cursor-pointer ${
                          currentPage === pageNum
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}

                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => handlePageChange(currentPage + 1)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold text-slate-700 transition cursor-pointer"
                    >
                      次のページ
                    </button>

                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => handlePageChange(totalPages)}
                      className="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none text-xs font-bold text-slate-700 transition cursor-pointer"
                    >
                      一番最後のページ
                    </button>
                  </nav>
                )}
              </>
            )}
          </section>

          {activeTab === 'deck' && (
            <aside className="lg:col-span-6 space-y-4 sticky top-20 h-fit">
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-4 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 w-1/2 sm:w-3/5">
                      <input
                        type="text"
                        value={deckName}
                        onChange={(e) => setDeckName(e.target.value)}
                        placeholder="デッキ名を入力"
                        className="font-black text-base text-slate-800 border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none w-full"
                      />
                      {currentDeckId && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold text-[9px] shrink-0">
                          既存編集
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={startSimulator}
                        title="このデッキで一人回しテストを開始"
                        className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-lg flex items-center gap-1 text-[11px] font-black shadow-sm cursor-pointer"
                      >
                        <Play className="h-3.5 w-3.5 fill-white" />
                        一人回し
                      </button>

                      <button
                        type="button"
                        disabled={totalDeckCardCount === 0 || isExportingImage}
                        onClick={exportDeckAsImage}
                        title="デッキレシピ画像をダウンロード"
                        className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                      >
                        {isExportingImage ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : <Camera className="h-4 w-4" />}
                      </button>

                      <button
                        type="button"
                        disabled={totalDeckCardCount === 0}
                        onClick={handleCopyDeckRecipe}
                        title="デッキレシピをクリップボードにコピー"
                        className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                      >
                        {copiedDeckList ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={startNewDeck}
                        title="新規デッキとしてやり直す"
                        className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                      >
                        <PlusCircle className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeckViewMode(deckViewMode === 'tiles' ? 'list' : 'tiles')}
                        title={deckViewMode === 'tiles' ? 'リスト表示へ切替' : '枚数分タイル表示へ切替'}
                        className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                      >
                        {deckViewMode === 'tiles' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={clearDeck}
                        title="デッキをクリア"
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-500">デッキ枚数:</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${totalDeckCardCount >= BASE_DECK_LIMIT ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {totalDeckCardCount >= BASE_DECK_LIMIT ? `${totalDeckCardCount}枚 構築完了` : `${totalDeckCardCount}枚 / 一時保存可`}
                      </span>
                    </div>
                    <span className={`font-black text-xs ${totalDeckCardCount >= BASE_DECK_LIMIT ? 'text-emerald-600 flex items-center gap-1' : 'text-blue-600'}`}>
                      {totalDeckCardCount} / {MAX_DECK_LIMIT}枚
                      {totalDeckCardCount >= BASE_DECK_LIMIT && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${totalDeckCardCount >= BASE_DECK_LIMIT ? 'bg-emerald-500' : 'bg-blue-600'}`}
                      style={{ width: `${Math.min(100, (totalDeckCardCount / MAX_DECK_LIMIT) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-600">デッキ所持率:</span>
                      <span className={`font-black ${ownershipData.percentage === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {ownershipData.percentage}%
                      </span>
                      <span className="text-[10px] text-slate-400">
                        ({ownershipData.ownedInDeckCount} / {totalDeckCardCount}枚)
                      </span>
                    </div>

                    {ownershipData.missingCards.length === 0 && totalDeckCardCount > 0 ? (
                      <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        全カード所持
                      </span>
                    ) : null}
                  </div>

                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${ownershipData.percentage === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${ownershipData.percentage}%` }}
                    />
                  </div>
                </div>

                {ownershipData.missingCards.length > 0 && (
                  <div className="rounded-2xl border border-amber-200/90 bg-amber-50/50 overflow-hidden transition-all shadow-2xs">
                    <div
                      onClick={() => setIsBuyListOpen(!isBuyListOpen)}
                      className="p-2.5 bg-amber-100/60 flex items-center justify-between cursor-pointer hover:bg-amber-100/90 transition select-none"
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs">
                          <ShoppingCart className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <span className="text-xs font-black text-amber-950">購入リスト（不足カード一覧）</span>
                          <span className="ml-2 text-[10px] font-extrabold text-amber-700 bg-amber-200/80 px-1.5 py-0.2 rounded-full">
                            あと{totalDeckCardCount - ownershipData.ownedInDeckCount}枚
                          </span>
                        </div>
                      </div>
                      <button type="button" className="text-amber-800 p-1 hover:bg-amber-200/50 rounded-lg transition cursor-pointer">
                        {isBuyListOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    {isBuyListOpen && (
                      <div className="p-2 space-y-1.5 max-h-[190px] overflow-y-auto">
                        {ownershipData.missingCards.map((item) => (
                          <div key={item.card.id} className="flex items-center justify-between p-2 rounded-xl bg-white border border-amber-100/80 text-xs shadow-2xs">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className="h-8 w-6 rounded overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                                {item.card.image_url ? <img src={item.card.image_url} alt="" className="w-full h-full object-cover" /> : null}
                              </div>
                              <div className="truncate">
                                <span className="font-bold text-slate-800 block truncate text-[11px]">{item.card.name}</span>
                                <span className="text-[10px] text-slate-400">デッキ投入 {item.needed} / 現在所持 {item.owned}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 font-black text-[11px]">不足: {item.missing}枚</span>
                              <button
                                type="button"
                                onClick={(e) => updateCount(item.card.id, 1, e)}
                                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-500 hover:text-white text-slate-700 font-bold text-[10px] transition border cursor-pointer"
                              >
                                所持+1
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {deckMessage && (
                  <div className={`p-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${deckMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {deckMessage.type === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                    {deckMessage.text}
                  </div>
                )}

                <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                    <BarChart2 className="h-3 w-3 text-blue-600" />
                    マナカーブ
                  </div>
                  <div className="flex items-end gap-1.5 h-10 pt-0.5">
                    {[1, 2, 3, 4, 5, 6, 7].map((cost) => {
                      const count = manaCurve[cost] || 0;
                      const heightPercent = totalDeckCardCount > 0 ? (count / 20) * 100 : 0;
                      return (
                        <div key={cost} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                          <span className="text-[8px] font-bold text-slate-500">{count > 0 ? count : ''}</span>
                          <div className="w-full bg-blue-500 rounded-t-xs transition-all duration-300" style={{ height: `${Math.max(4, Math.min(100, heightPercent))}%` }} />
                          <span className="text-[8px] font-bold text-slate-400">{cost === 7 ? '7+' : cost}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  {flattenedDeckCards.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-400 font-medium border-2 border-dashed border-slate-100 rounded-2xl">
                      左のカード一覧から「デッキに追加」を押してください
                    </div>
                  ) : deckViewMode === 'tiles' ? (
                    <div>
                      <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center justify-between">
                        <span>デッキ一覧（クリックで1枚削除）</span>
                        <span>{flattenedDeckCards.length}枚</span>
                      </div>

                      <div className="max-h-[380px] overflow-y-auto pr-0.5">
                        <div className="grid grid-cols-8 gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-100">
                          {flattenedDeckCards.map((card, idx) => (
                            <div
                              key={`${card.id}-${idx}`}
                              onClick={() => removeCardFromDeck(card.id)}
                              title={`${card.name}（クリックで1枚減らす）`}
                              className="group relative aspect-[3/4] rounded overflow-hidden border border-slate-200 bg-white shadow-2xs cursor-pointer hover:border-red-400 hover:scale-105 transition duration-150"
                            >
                              {card.image_url ? (
                                <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="text-[6px] text-slate-400 flex items-center justify-center h-full">No Img</div>
                              )}
                              <span className="absolute top-0.5 left-0.5 px-0.5 rounded bg-black/80 text-white font-extrabold text-[7px] leading-tight">
                                {card.cost ?? '-'}
                              </span>
                              <div className="absolute inset-0 bg-red-600/75 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold text-xs">
                                <Minus className="h-3 w-3" />
                              </div>
                            </div>
                          ))}

                          {flattenedDeckCards.length < BASE_DECK_LIMIT &&
                            Array.from({ length: BASE_DECK_LIMIT - flattenedDeckCards.length }).map((_, emptyIdx) => (
                              <div key={`empty-${emptyIdx}`} className="aspect-[3/4] rounded border border-dashed border-slate-200 flex items-center justify-center text-slate-300 text-[8px] select-none">
                                +
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
                      {Object.entries(deckCards).map(([cardId, count]) => {
                        const card = cards.find((c) => c.id === cardId);
                        if (!card) return null;
                        const owned = counts[card.id] || 0;
                        const isShort = count > owned;

                        return (
                          <div key={cardId} className="flex items-center justify-between p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition border border-slate-100 text-xs">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <div className="h-8 w-6 rounded overflow-hidden bg-slate-200 shrink-0 border">
                                {card.image_url ? <img src={card.image_url} alt="" className="w-full h-full object-cover" /> : null}
                              </div>
                              <div className="truncate">
                                <span className="font-bold text-slate-800 block truncate text-[11px]">{card.name}</span>
                                <span className={`text-[9px] font-semibold ${isShort ? 'text-amber-600' : 'text-slate-400'}`}>
                                  ★{card.cost ?? '-'} • 所持: {owned}枚 {isShort && `(${count - owned}枚 不足)`}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0 bg-white border border-slate-200 rounded-lg p-0.5">
                              <button type="button" onClick={() => removeCardFromDeck(card.id)} className="h-4 w-4 flex items-center justify-center hover:bg-slate-100 rounded text-slate-600">
                                <Minus className="h-2.5 w-2.5" />
                              </button>
                              <span className="w-4 text-center font-bold text-slate-800 text-[11px]">{count}</span>
                              <button type="button" onClick={() => addCardToDeck(card)} disabled={count >= 4 || totalDeckCardCount >= MAX_DECK_LIMIT} className="h-4 w-4 flex items-center justify-center hover:bg-slate-100 rounded text-slate-600 disabled:opacity-30">
                                <Plus className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={saveDeckToDB}
                  disabled={deckSaving || totalDeckCardCount === 0}
                  className={`w-full py-2.5 text-white font-bold rounded-2xl text-xs transition shadow-md flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer ${
                    totalDeckCardCount >= BASE_DECK_LIMIT ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {deckSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {currentDeckId
                    ? `上書き保存する（${totalDeckCardCount}枚）`
                    : totalDeckCardCount >= BASE_DECK_LIMIT
                    ? `デッキを新規保存する（${totalDeckCardCount}枚 構築完了）`
                    : `下書き保存する（${totalDeckCardCount}/${MAX_DECK_LIMIT}枚）`}
                </button>
              </div>
            </aside>
          )}
        </div>
      )}

      {/* ---------------- カード詳細モーダル ---------------- */}
      {activeCard && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 cursor-default"
          onClick={() => setActiveCard(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => setActiveCard(null)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 rounded-full">
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <div className="w-full sm:w-1/2 aspect-[5/7] bg-slate-100 rounded-2xl overflow-hidden flex items-center justify-center shrink-0 border">
                {activeCard.image_url ? (
                  <img src={activeCard.image_url} alt={activeCard.name} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-slate-400 text-xs">画像なし</span>
                )}
              </div>

              <div className="flex-1 space-y-3">
                <div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">{activeCard.card_type}</span>
                  <h2 className="text-lg font-bold mt-1 leading-snug">{activeCard.name}</h2>
                </div>

                <div className="grid grid-cols-2 gap-y-2 text-xs border-y py-2.5">
                  <div><span className="text-slate-400">文明: </span><span className="font-semibold text-slate-800">{activeCard.civilization.join(', ')}</span></div>
                  <div><span className="text-slate-400">レアリティ: </span><span className="font-semibold text-slate-800">{activeCard.rarity || '-'}</span></div>
                  <div><span className="text-slate-400">コスト: </span><span className="font-semibold text-slate-800">{activeCard.cost ?? '-'}</span></div>
                  <div><span className="text-slate-400">パワー: </span><span className="font-semibold text-slate-800">{activeCard.power ?? '-'}</span></div>
                  <div className="col-span-2"><span className="text-slate-400">種族: </span><span className="font-semibold text-slate-800">{activeCard.race?.length ? activeCard.race.join(' / ') : 'なし'}</span></div>
                  <div className="col-span-2"><span className="text-slate-400">収録弾: </span><span className="font-semibold text-slate-800">{activeCard.set_name || '不明 / プロモ'}</span></div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">能力</h4>
                  <p className="text-xs bg-slate-50 p-2.5 rounded-xl border text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {activeCard.effect || '通常カード（能力なし）'}
                  </p>
                </div>

                <div className="bg-slate-50 p-2.5 rounded-2xl border flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">所有枚数:</span>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => updateCount(activeCard.id, -1)} className="h-7 w-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-xs font-black">{counts[activeCard.id] || 0}</span>
                    <button type="button" onClick={() => updateCount(activeCard.id, 1)} className="h-7 w-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-100">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- フッター（非公式表記・免責事項） ---------------- */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 mt-12 pt-6 border-t border-slate-200 text-center text-[11px] text-slate-400 space-y-1">
        <p className="font-bold text-slate-500">DM Deck Hub（非公式ファンツール）</p>
        <p>
          当サイトはデュエル・マスターズ（Duel Masters）の非公式ファンサイトであり、株式会社タカラトミーおよび Wizards of the Coast とは一切関係ありません。
        </p>
        <p>
          掲載されているカード画像・テキスト等の著作権は各権利元に帰属します。
        </p>
      </footer>
    </div>
  );
}