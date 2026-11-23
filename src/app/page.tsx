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
  Edit3,
  Eye,
  Send,
} from 'lucide-react';
import { User } from '@supabase/supabase-js';

const DEFAULT_CARDS: Card[] = [];

const MAX_DECK_LIMIT = 60;
const BASE_DECK_LIMIT = 40;
const MAX_HYPERSPATIAL_LIMIT = 8;
const MAX_GR_LIMIT = 12;

type DeckZoneCategory = 'main' | 'hyperspatial' | 'gr' | 'special';

const BATTLE_ZONE_CARD_TYPES = new Set([
  'クリーチャー',
  'クロスギア',
  '進化クリーチャー',
  'NEOクリーチャー',
  'G-NEOクリーチャー',
  'S-MAX進化クリーチャー',
  'ギガ・オレガ・オーラ',
  'WDフィールド',
  'オレガ・オーラ',
  'ヒストリック・フィールド',
  'ドリーム・クリーチャー',
  '進化ドリーム・クリーチャー',
  'G-NEOドリーム・クリーチャー',
  'NEOドリーム・クリーチャー',
  'スター進化クリーチャー',
  'タマシード',
  'DGフィールド',
  'D2フィールド',
  'ドラゴニック・フィールド',
  'エグザイル・クリーチャー',
  '禁断フィールド',
  '禁断の鼓動',
  'キング・セル',
  'タマシード/クリーチャー',
  '無月フィールド',
  'デュエリスト',
  'ルナティック・フィールド',
  'Mono Artifact',
  '土地',
  'フェアリー・フィールド',
  'DMフィールド',
  'T2フィールド',
  '幸せのフィールド',
  '進化エグザイル・クリーチャー',
  '進化クリーチャー(究極進化)',
  '進化クリーチャー(進化GV)',
  '進化クリーチャー(墓地進化GV)',
  '進化クリーチャー(進化V)',
  '進化クリーチャー(墓地進化)',
  '進化クリーチャー(超無限進化)',
  '進化クリーチャー(超無限進化・Ω)',
  '進化クリーチャー(マナ進化)',
  '進化クリーチャー(墓地進化V)',
  '進化クロスギア',
  '進化クリーチャー(デッキ進化)',
  '進化クリーチャー(手札進化)',
  '進化クリーチャー(手札進化V)',
  '進化クリーチャー(マナ進化V)',
  '進化クリーチャー(超無限墓地進化)',
].map((t) => t.normalize('NFKC')));

const HYPERSPATIAL_CARD_TYPES = new Set([
  'サイキック・クリーチャー',
  'ドラグハート・ウエポン',
  'サイキック・クロスギア',
  'ルール・プラス',
  'デュエルメイト・クリーチャー',
  'デュエルメイト呪文',
  'ドラグハート・フォートレス',
  'ドラグハート・タマシード',
  '禁断クリーチャー',
  '進化サイキック・クリーチャー',
  '零龍の儀',
  '零龍星雲',
  '最終禁断フィールド',
  '進化サイキック・クリーチャー(超無限進化)',
].map((t) => t.normalize('NFKC')));

const GR_CARD_TYPES = new Set([
  'GRクリーチャー',
  'NEO GRクリーチャー',
].map((t) => t.normalize('NFKC')));

const CASTLE_CARD_TYPES = new Set([
  '城',
  'G城',
].map((t) => t.normalize('NFKC')));

const getCardDeckZone = (card: Card): DeckZoneCategory => {
  const ct = (card.card_type || '').normalize('NFKC').trim();
  const nm = (card.name || '').normalize('NFKC');
  const races = Array.isArray(card.race) ? card.race.join(' ').normalize('NFKC') : '';

  // GRゾーン（GRクリーチャー / NEO GRクリーチャー）
  if (
    GR_CARD_TYPES.has(ct) ||
    ct.includes('GRクリーチャー') ||
    ct.includes('ガチャレンジ') ||
    races.includes('GR')
  ) {
    return 'gr';
  }

  // 禁断 / ドルマゲドン / ゼーロン専用ゾーン（ゲーム開始時配置セット）
  if (
    ct === '禁断フィールド' ||
    ct === '禁断の鼓動' ||
    ct === '最終禁断フィールド' ||
    ct === '零龍の儀' ||
    ct === '零龍星雲' ||
    ct.includes('ドルマゲドン') ||
    nm.includes('禁断 ～封印されしX～') ||
    nm.includes('伝説の禁断 ドキンダムX') ||
    nm.includes('FORBIDDEN STAR') ||
    nm.includes('終焉の禁断 ドルマゲドンX') ||
    nm.includes('滅亡の起源 零無') ||
    nm.includes('零龍')
  ) {
    return 'special';
  }

  // 超次元ゾーン（サイキック / ドラグハート / デュエルメイト / ルール・プラス / 禁断クリーチャー等）
  if (
    HYPERSPATIAL_CARD_TYPES.has(ct) ||
    ct.includes('サイキック') ||
    ct.includes('ドラグハート') ||
    ct.includes('デュエルメイト') ||
    ct.includes('ルール・プラス') ||
    ct.includes('禁断クリーチャー') ||
    ct.includes('超次元') ||
    races.includes('サイキック') ||
    races.includes('ドラグハート')
  ) {
    return 'hyperspatial';
  }

  return 'main';
};

type CardPlayCapability = {
  canBattle: boolean;
  canSpell: boolean;
  canCastle: boolean;
  battleLabel: string;
};

const getCardPlayCapability = (card: Card): CardPlayCapability => {
  const ct = (card.card_type || '').normalize('NFKC').trim();
  const isCastle = CASTLE_CARD_TYPES.has(ct) || ct === '城' || ct === 'G城';
  const isPureSpell = ct === '呪文';
  const isTwinpact = ct.includes('/') && ct.includes('呪文') && ct !== 'タマシード/クリーチャー';
  const isBattleCard =
    BATTLE_ZONE_CARD_TYPES.has(ct) ||
    ct.includes('クリーチャー') ||
    ct.includes('タマシード') ||
    ct.includes('クロスギア') ||
    ct.includes('オーラ') ||
    ct.includes('フィールド') ||
    ct.includes('デュエリスト') ||
    ct.includes('キング・セル') ||
    ct.includes('Artifact') ||
    ct.includes('土地');

  if (isCastle) {
    return { canBattle: false, canSpell: false, canCastle: true, battleLabel: '要塞化' };
  }
  if (isTwinpact) {
    return { canBattle: true, canSpell: true, canCastle: false, battleLabel: '召喚' };
  }
  if (isPureSpell) {
    return { canBattle: false, canSpell: true, canCastle: false, battleLabel: '詠唱' };
  }
  if (isBattleCard || !ct.includes('呪文')) {
    const label =
      ct.includes('クリーチャー') || ct.includes('デュエリスト')
        ? '召喚'
        : ct.includes('フィールド') || ct.includes('土地')
        ? '展開'
        : '場に出す';
    return { canBattle: true, canSpell: false, canCastle: false, battleLabel: label };
  }
  return { canBattle: false, canSpell: true, canCastle: false, battleLabel: '詠唱' };
};
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
  const [currentPage, setCurrentPage] = useState<number>(() => {
    if (typeof window === 'undefined') return 1;
    try {
      const savedPage = Number(sessionStorage.getItem('dm_deck_hub_current_page'));
      if (Number.isInteger(savedPage) && savedPage >= 1) return savedPage;
    } catch {}
    return 1;
  });
  const [user, setUser] = useState<User | null>(null);

  const cardListTopRef = useRef<HTMLDivElement | null>(null);
  const isInitialFilterMount = useRef<boolean>(true);
  const [isClientMounted, setIsClientMounted] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'collection' | 'deck' | 'friends' | 'settings'>(() => {
    if (typeof window === 'undefined') return 'deck';
    try {
      const savedTab = sessionStorage.getItem('dm_deck_hub_active_tab');
      if (savedTab === 'collection' || savedTab === 'deck' || savedTab === 'friends' || savedTab === 'settings') {
        return savedTab;
      }
    } catch {}
    return 'deck';
  });

  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  useEffect(() => {
    if (!isClientMounted) return;
    try {
      sessionStorage.setItem('dm_deck_hub_active_tab', activeTab);
    } catch {}
  }, [activeTab, isClientMounted]);

  useEffect(() => {
    if (!isClientMounted) return;
    try {
      sessionStorage.setItem('dm_deck_hub_current_page', String(currentPage));
    } catch {}
  }, [currentPage, isClientMounted]);
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
  const [deckTabScreen, setDeckTabScreen] = useState<'list' | 'editor'>('list');
  const [selectedDeckForAction, setSelectedDeckForAction] = useState<string | null>(null);
  const [thumbnailCardId, setThumbnailCardId] = useState<string | null>(null);
  const [isThumbnailModalOpen, setIsThumbnailModalOpen] = useState<boolean>(false);
  const [savedDecks, setSavedDecks] = useState<{ id: string; name: string; created_at: string; total_cards: number; thumbnail_card_id?: string | null }[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [selectedDeckZoneFilter, setSelectedDeckZoneFilter] = useState<DeckZoneCategory>('main');
  const [isEditorSessionRestored, setIsEditorSessionRestored] = useState(false);

  // デッキ編集画面・編集内容の復元（リロード時にデッキ一覧へ戻らないようにする）
  useEffect(() => {
    if (!isClientMounted || isEditorSessionRestored) return;
    try {
      const raw = sessionStorage.getItem('dm_deck_hub_editor_session_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.deckTabScreen === 'editor' || parsed.deckTabScreen === 'list') {
          setDeckTabScreen(parsed.deckTabScreen);
        }
        if (typeof parsed.currentDeckId === 'string' || parsed.currentDeckId === null) {
          setCurrentDeckId(parsed.currentDeckId);
        }
        if (typeof parsed.deckName === 'string') {
          setDeckName(parsed.deckName);
        }
        if (parsed.deckCards && typeof parsed.deckCards === 'object') {
          setDeckCards(parsed.deckCards);
        }
        if (typeof parsed.thumbnailCardId === 'string' || parsed.thumbnailCardId === null) {
          setThumbnailCardId(parsed.thumbnailCardId);
        }
        if (
          parsed.selectedDeckZoneFilter === 'main' ||
          parsed.selectedDeckZoneFilter === 'hyperspatial' ||
          parsed.selectedDeckZoneFilter === 'gr' ||
          parsed.selectedDeckZoneFilter === 'special'
        ) {
          setSelectedDeckZoneFilter(parsed.selectedDeckZoneFilter);
        }
      }
    } catch {}
    setIsEditorSessionRestored(true);
  }, [isClientMounted, isEditorSessionRestored]);

  // デッキ編集画面・編集内容の自動保存
  useEffect(() => {
    if (!isClientMounted || !isEditorSessionRestored) return;
    try {
      sessionStorage.setItem(
        'dm_deck_hub_editor_session_v1',
        JSON.stringify({
          deckTabScreen,
          currentDeckId,
          deckName,
          deckCards,
          thumbnailCardId,
          selectedDeckZoneFilter,
        })
      );
    } catch {}
  }, [
    isClientMounted,
    isEditorSessionRestored,
    deckTabScreen,
    currentDeckId,
    deckName,
    deckCards,
    thumbnailCardId,
    selectedDeckZoneFilter,
  ]);

  const getLocalDeckThumbs = (): Record<string, string> => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem('dm_deck_hub_deck_thumbs') || '{}');
    } catch {
      return {};
    }
  };

  const setLocalDeckThumb = (deckId: string, cardId: string | null) => {
    if (typeof window === 'undefined') return;
    try {
      const cur = getLocalDeckThumbs();
      if (cardId) {
        cur[deckId] = cardId;
      } else {
        delete cur[deckId];
      }
      localStorage.setItem('dm_deck_hub_deck_thumbs', JSON.stringify(cur));
    } catch {}
  };

  // 購入リスト枠の開閉状態
  const [isBuyListOpen, setIsBuyListOpen] = useState(false);
  const [copiedDeckList, setCopiedDeckList] = useState(false);

  // ---------------- 一人回しシミュレーターステート ----------------
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simTurn, setSimTurn] = useState<number>(1);
  const [currentPhase, setCurrentPhase] = useState<DuelPhase>('mana');
  const [hasChargedManaThisTurn, setHasChargedManaThisTurn] = useState(false);

  // ゾーン操作モーダル（山札・墓地・マナ）
  type DeckPeekDestination = 'hand' | 'mana' | 'graveyard' | 'shield' | 'battle';
  type DeckRemainderHandling = 'bottom_shuffle' | 'bottom_order' | 'top_order' | 'deck_shuffle';
  type ZoneMoveAction =
    | 'hand'
    | 'mana'
    | 'deck_shuffle_pos'
    | 'deck_order_pos'
    | 'deck_all_shuffle'
    | 'shield'
    | 'battle';

  const [deckActionModal, setDeckActionModal] = useState<{
    step: 'config' | 'select';
    peekCount: number;
    destination: DeckPeekDestination;
    peekedCards: SimCardInstance[];
    selectedIds: string[];
    remainderHandling: DeckRemainderHandling;
  } | null>(null);

  const [zoneActionModal, setZoneActionModal] = useState<{
    zone: 'graveyard' | 'mana';
    action: ZoneMoveAction;
    deckPosition: 'top' | 'bottom';
    selectedIds: string[];
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

  // 特殊外部ゾーン（超次元・GR・禁断/ドルマゲドン/ゼーロン）
  const [simHyperspatial, setSimHyperspatial] = useState<SimCardInstance[]>([]);
  const [simGrZone, setSimGrZone] = useState<SimCardInstance[]>([]);
  const [simSpecialZone, setSimSpecialZone] = useState<SimCardInstance[]>([]);
  const [simSeals, setSimSeals] = useState<SimCardInstance[]>([]);
  const [simSpecialLiberated, setSimSpecialLiberated] = useState<boolean>(false);
  const [simZeronRituals, setSimZeronRituals] = useState<{
    resurrection: boolean;
    graveyard: boolean;
    hand: boolean;
    destruction: boolean;
  }>({ resurrection: false, graveyard: false, hand: false, destruction: false });
  const [externalZoneModal, setExternalZoneModal] = useState<'hyperspatial' | 'gr' | 'special' | null>(null);

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
  const [sortBy, setSortBy] = useState<"release" | "name" | "civilization" | "cost" | "rarity">("release");

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

  const normalizeDeckCardName = useCallback((name: string) => {
    return (name || "").replace(/[\s\u3000]+/g, " ").trim();
  }, []);

  const deckCardNameCounts = useMemo(() => {
    const map: Record<string, number> = {};
    const cardById = new Map(cards.map((c) => [c.id, c]));
    Object.entries(deckCards).forEach(([cardId, count]) => {
      const card = cardById.get(cardId);
      const key = card ? normalizeDeckCardName(card.name) : cardId;
      map[key] = (map[key] || 0) + count;
    });
    return map;
  }, [deckCards, cards, normalizeDeckCardName]);

  const deckCardsByZone = useMemo(() => {
    const main: Card[] = [];
    const hyperspatial: Card[] = [];
    const gr: Card[] = [];
    const special: Card[] = [];
    const cardById = new Map(cards.map((c) => [c.id, c]));

    Object.entries(deckCards).forEach(([cardId, count]) => {
      const card = cardById.get(cardId);
      if (!card) return;
      const zone = getCardDeckZone(card);
      for (let i = 0; i < count; i++) {
        if (zone === 'hyperspatial') hyperspatial.push(card);
        else if (zone === 'gr') gr.push(card);
        else if (zone === 'special') special.push(card);
        else main.push(card);
      }
    });

    const sorter = (a: Card, b: Card) => (a.cost || 0) - (b.cost || 0);
    return {
      main: main.sort(sorter),
      hyperspatial: hyperspatial.sort(sorter),
      gr: gr.sort(sorter),
      special: special.sort(sorter),
    };
  }, [deckCards, cards]);

  const flattenedDeckCards = deckCardsByZone.main;
  const mainDeckCount = deckCardsByZone.main.length;
  const hyperspatialCount = deckCardsByZone.hyperspatial.length;
  const grCount = deckCardsByZone.gr.length;
  const specialZoneCount = deckCardsByZone.special.length;

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

  const extractSetCode = useCallback((raw?: string | null) => {
    if (!raw) return "";
    const cleaned = raw
      .trim()
      .replace(/^[（(【\[]+|[）)】\]]+$/g, "")
      .trim();
    if (!cleaned) return "";
    const dmMatch = cleaned.match(/^(DM[A-Z0-9-]+)/i);
    if (dmMatch) {
      return dmMatch[1].toUpperCase();
    }
    const firstToken = cleaned.split(/[\s\u3000/／]+/)[0] || "";
    return firstToken.replace(/^[（(【\[]+|[）)】\]]+$/g, "").trim();
  }, []);

  // デュエマ歴代シリーズ・発売時期に基づく並び順スコア（数値が大きいほど最新）
  const getSetReleaseScore = useCallback((code: string): number => {
    const c = code.toUpperCase().trim();

    // 0. 初期基本編〜覚醒編 (2002〜2011): DM-01〜DM-39 / DM01〜DM39 / DMC-01〜68
    // ※ DM27〜DM39 が年号(2027〜2039)と誤認されないよう最初に判定
    const classicMatch = c.match(/^DM(C)?-?(\d{1,2})$/);
    if (classicMatch) {
      const isC = Boolean(classicMatch[1]);
      const num = parseInt(classicMatch[2], 10);
      const maxRef = isC ? 68 : 39;
      const approxYear = 2002 + Math.round((num / maxRef) * 8.5);
      return approxYear * 10000 + num * 10;
    }

    // 1. 新シリーズ形式 (2022〜2026+): DM26RP1, DM26EX5, DM25RP2, DM24EX1, DM22RP1 など
    const modernMatch = c.match(/^DM(\d{2})-?(RP|EX|SD|BD|SP|ART|G|S|T)(\d+)?/);
    if (modernMatch) {
      const yearNum = parseInt(modernMatch[1], 10);
      if (yearNum >= 22 && yearNum <= 26) {
        const year = 2000 + yearNum;
        const subType = modernMatch[2] || "";
        const num = parseInt(modernMatch[3] || "0", 10);
        const subOrder: Record<string, number> = {
          RP: 1,
          EX: 2,
          SD: 3,
          BD: 4,
          SP: 5,
          ART: 6,
        };
        return year * 10000 + (subOrder[subType] || 0) * 100 + num;
      }
    }

    // 2. 新章〜王来MAX (2017〜2022): DMRP-01〜22, DMEX-01〜19, DMSD-01〜21, DMBD-01〜22
    const neoMatch = c.match(/^DM(RP|EX|SD|BD)-?(\d+)/);
    if (neoMatch) {
      const num = parseInt(neoMatch[2], 10);
      const approxYear = 2017 + Math.floor((num - 1) / 4);
      return approxYear * 10000 + num * 10;
    }

    // 3. E1〜革命ファイナル (2011〜2017): DMR-01〜23, DMD-01〜35, DMX-01〜26
    const revMatch = c.match(/^DM(R|D|X)-?(\d+)/);
    if (revMatch) {
      const prefix = revMatch[1];
      const num = parseInt(revMatch[2], 10);
      const maxRef = prefix === "R" ? 23 : prefix === "D" ? 35 : 26;
      const approxYear = 2011 + Math.round((num / maxRef) * 5.5);
      return approxYear * 10000 + num * 10;
    }

    // 4. プロモ系 (P1/Y24 など)
    const promoYearMatch = c.match(/Y(\d{2})/);
    if (promoYearMatch) {
      const y = parseInt(promoYearMatch[1], 10);
      const fullYear = y >= 50 ? 1900 + y : 2000 + y;
      return fullYear * 10000;
    }

    return 0;
  }, []);

  const availableSetNames = useMemo(() => {
    const setNames = new Set<string>();
    cards.forEach((c) => {
      const code = extractSetCode(c.set_name);
      if (code) setNames.add(code);
    });
    return Array.from(setNames).sort((a, b) => {
      const scoreA = getSetReleaseScore(a);
      const scoreB = getSetReleaseScore(b);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return b.localeCompare(a, "ja", { numeric: true, sensitivity: "base" });
    });
  }, [cards, extractSetCode, getSetReleaseScore]);

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
  }, [activeTab, searchName, searchRace, selectedCardType, selectedDeckZoneFilter, selectedSet, selectedCivilization, selectedCost, onlyOwned]);

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
      if (activeTab === 'deck' && getCardDeckZone(card) !== selectedDeckZoneFilter) return false;
      if (searchName.trim()) {
        const q = normalizeSearchText(searchName.trim());
        const targetName = normalizeSearchText(card.name || '');
        const targetRuby = normalizeSearchText(card.ruby || '');
        const imgFile = (card.image_url || '').split('/').pop()?.split('?')[0].toLowerCase() || '';
        if (!targetName.includes(q) && !targetRuby.includes(q) && !(imgFile && rubyMatchedNames.has(imgFile))) return false;
      }
      if (searchRace && !(card.race || []).some((r) => r.toLowerCase().includes(searchRace.toLowerCase()))) return false;
      if (selectedCardType !== 'all' && (!card.card_type || !card.card_type.includes(selectedCardType))) return false;
      if (selectedSet !== 'all' && extractSetCode(card.set_name) !== selectedSet) return false;
      if (selectedCivilization !== 'all') {
        if (selectedCivilization === 'zero') {
          const civs = card.civilization || [];
          const isZero =
            civs.length === 0 ||
            civs.some((c) => ["ゼロ", "零", "無色", "zero"].includes(c.toLowerCase()));
          if (!isZero) return false;
        } else if (selectedCivilization === 'multicolor') {
          const civs = (card.civilization || []).filter(
            (c) => !["ゼロ", "零", "無色", "zero"].includes(c.toLowerCase())
          );
          const isMulti =
            civs.length >= 2 ||
            (card.civilization || []).some((c) => c.includes("多色") || c.includes("レインボー"));
          if (!isMulti) return false;
        } else if (!card.civilization.includes(selectedCivilization)) {
          return false;
        }
      }
      if (selectedCost !== 'all') {
        const costNum = parseInt(selectedCost, 10);
        if (costNum === 10 ? (card.cost || 0) < 10 : card.cost !== costNum) return false;
      }
      if (onlyOwned && (counts[card.id] || 0) === 0) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === "name") {
        const nameA = (a.ruby || a.name || "").trim();
        const nameB = (b.ruby || b.name || "").trim();
        return nameA.localeCompare(nameB, "ja", { numeric: true, sensitivity: "base" });
      }
      if (sortBy === "civilization") {
        const getCivRank = (civList?: string[]): number => {
          const valid = (civList || []).filter(
            (c) => !["ゼロ", "零", "無色", "zero"].includes(c.toLowerCase())
          );
          const hasMultiTag = (civList || []).some(
            (c) => c.includes("多色") || c.includes("レインボー")
          );
          if (valid.length >= 2 || hasMultiTag) return 6; // 多色
          if (valid.length === 0) return 7; // 零文明（無色）
          const single = valid[0];
          if (single.includes("火")) return 1;
          if (single.includes("水")) return 2;
          if (single.includes("自然")) return 3;
          if (single.includes("光")) return 4;
          if (single.includes("闇")) return 5;
          return 7;
        };
        const rankDiff = getCivRank(a.civilization) - getCivRank(b.civilization);
        if (rankDiff !== 0) return rankDiff;
        const costA = typeof a.cost === "number" ? a.cost : 999;
        const costB = typeof b.cost === "number" ? b.cost : 999;
        if (costA !== costB) return costA - costB;
        return (a.ruby || a.name || "").localeCompare(b.ruby || b.name || "", "ja");
      }
      if (sortBy === "cost") {
        const costA = typeof a.cost === "number" ? a.cost : 999;
        const costB = typeof b.cost === "number" ? b.cost : 999;
        if (costA !== costB) return costA - costB;
        return (a.ruby || a.name || "").localeCompare(b.ruby || b.name || "", "ja");
      }
      if (sortBy === "rarity") {
        const getRarityRank = (raw?: string | null): number => {
          const r = (raw || "").trim().toUpperCase();
          if (!r || r === "-" || r === "NONE" || r === "不明" || r === "プロモ" || r === "P" || r === "PROMO") return 90;
          // 最高レアリティ帯（オーバーレア / ドリームレア / キングマスター / マスター / レジェンド / ビクトリー等）
          if (r === "OR" || r.includes("オーバー")) return 1;
          if (r === "DMR" || r.includes("ドリーム")) return 2;
          if (r === "KGM" || r.includes("キングマスター")) return 3;
          if (r === "MAS" || r === "MDG" || r === "MSS" || r.includes("マスター")) return 4;
          if (r === "LEG" || r === "L" || r.includes("レジェンド")) return 5;
          if (r === "VIC" || r === "V" || r.includes("ビクトリー")) return 6;
          if (r === "SEC" || r.includes("シークレット")) return 7;
          if (r === "SP" || r.includes("スペシャル") || r.includes("金トレジャー") || r.includes("銀トレジャー") || r.includes("キャラプレミアム")) return 8;
          // 通常レアリティ帯
          if (r === "SR" || r.includes("スーパー")) return 10;
          if (r === "VR" || r.includes("ベリー")) return 20;
          if (r === "R" || r === "RARE" || r === "レア") return 30;
          if (r === "UC" || r === "U" || r === "UNCOMMON" || r.includes("アンコモン")) return 40;
          if (r === "C" || r === "COMMON" || r.includes("コモン")) return 50;
          return 80;
        };
        const rankDiff = getRarityRank(a.rarity) - getRarityRank(b.rarity);
        if (rankDiff !== 0) return rankDiff;
        const scoreA = getSetReleaseScore(extractSetCode(a.set_name));
        const scoreB = getSetReleaseScore(extractSetCode(b.set_name));
        if (scoreA !== scoreB) return scoreB - scoreA;
        return (a.ruby || a.name || "").localeCompare(b.ruby || b.name || "", "ja");
      }
      // デフォルト: release（発売日順: 新しい弾 → 古い弾）
      const scoreA = getSetReleaseScore(extractSetCode(a.set_name));
      const scoreB = getSetReleaseScore(extractSetCode(b.set_name));
      if (scoreA !== scoreB) return scoreB - scoreA;
      return (a.ruby || a.name || "").localeCompare(b.ruby || b.name || "", "ja");
    });
  }, [cards, activeTab, selectedDeckZoneFilter, counts, searchName, searchRace, selectedCardType, selectedSet, selectedCivilization, selectedCost, onlyOwned, sortBy, normalizeSearchText, rubyMatchedNames, extractSetCode, getSetReleaseScore]);

  // 検索条件・並び順が変わったら1ページ目に戻す（初回マウント時は保存済みページ番号を優先）
  useEffect(() => {
    if (isInitialFilterMount.current) {
      isInitialFilterMount.current = false;
      return;
    }
    setCurrentPage(1);
  }, [searchName, searchRace, selectedCardType, selectedSet, selectedCivilization, selectedCost, onlyOwned, sortBy]);

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
    const zone = getCardDeckZone(card);
    const targetNameKey = normalizeDeckCardName(card.name);
    const sameNameTotal = deckCardNameCounts[targetNameKey] || 0;

    if (zone === 'hyperspatial') {
      if (hyperspatialCount >= MAX_HYPERSPATIAL_LIMIT) {
        setDeckMessage({ text: `超次元ゾーンは最大${MAX_HYPERSPATIAL_LIMIT}枚までです。`, type: 'error' });
        return;
      }
      if (sameNameTotal >= 4) {
        setDeckMessage({ text: `「${card.name}」は同名カードのため合計4枚までです。`, type: 'error' });
        return;
      }
    } else if (zone === 'gr') {
      if (grCount >= MAX_GR_LIMIT) {
        setDeckMessage({ text: `GRゾーンは最大${MAX_GR_LIMIT}枚までです。`, type: 'error' });
        return;
      }
      if (sameNameTotal >= 2) {
        setDeckMessage({ text: `GRカード「${card.name}」は同名2枚までしか入れられません。`, type: 'error' });
        return;
      }
    } else if (zone === 'special') {
      if (sameNameTotal >= 1) {
        setDeckMessage({ text: `禁断／ドルマゲドン／ゼーロンカード「${card.name}」は1枚（1セット）までです。`, type: 'error' });
        return;
      }
      if (specialZoneCount >= 5) {
        setDeckMessage({ text: '禁断／ドルマゲドン／ゼーロン専用ゾーンの上限に達しています。', type: 'error' });
        return;
      }
    } else {
      if (mainDeckCount >= MAX_DECK_LIMIT) {
        setDeckMessage({ text: `メインデッキは最大${MAX_DECK_LIMIT}枚までです。`, type: 'error' });
        return;
      }
      if (sameNameTotal >= 4) {
        setDeckMessage({ text: `「${card.name}」は同名カードのため合計4枚までしか入れられません。`, type: 'error' });
        return;
      }
    }

    setDeckCards((prev) => ({ ...prev, [card.id]: (prev[card.id] || 0) + 1 }));
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
    setThumbnailCardId(null);
    setDeckMessage(null);
    setDeckTabScreen('editor');
  };

  const fetchSavedDecksSilent = async () => {
    if (!user) {
      setSavedDecks([]);
      return;
    }
    try {
      setLoadingDecks(true);
      const localThumbs = getLocalDeckThumbs();
      let { data, error } = await supabase
        .from('decks')
        .select(`id, name, created_at, thumbnail_card_id, deck_cards (card_id, count)`)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) {
        const fallback = await supabase
          .from('decks')
          .select(`id, name, created_at, deck_cards (card_id, count)`)
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });
        if (fallback.error) throw fallback.error;
        data = fallback.data as any;
      }
      setSavedDecks(
        (data || []).map((d: any) => {
          const fallbackCardId = d.deck_cards && d.deck_cards.length > 0 ? d.deck_cards[0].card_id : null;
          return {
            id: d.id,
            name: d.name,
            created_at: d.created_at,
            total_cards: (d.deck_cards || []).reduce((acc: number, c: any) => acc + (c.count || 0), 0),
            thumbnail_card_id: d.thumbnail_card_id || localThumbs[d.id] || fallbackCardId,
          };
        })
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDecks(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'deck') {
      fetchSavedDecksSilent();
    }
  }, [activeTab, user]);

  const duplicateSavedDeck = async (deckId: string, originalName: string) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    try {
      setLoadingDecks(true);
      const sourceDeck = savedDecks.find((d) => d.id === deckId);
      const sourceThumb = sourceDeck?.thumbnail_card_id || getLocalDeckThumbs()[deckId] || null;

      const { data: cardsData, error: cardsError } = await supabase
        .from('deck_cards')
        .select('card_id, count')
        .eq('deck_id', deckId);
      if (cardsError) throw cardsError;

      const copyName = `${originalName} のコピー`;
      let { data: newDeck, error: insertError } = await supabase
        .from('decks')
        .insert({ user_id: user.id, name: copyName, thumbnail_card_id: sourceThumb })
        .select()
        .single();
      if (insertError) {
        const fallback = await supabase
          .from('decks')
          .insert({ user_id: user.id, name: copyName })
          .select()
          .single();
        newDeck = fallback.data;
        insertError = fallback.error;
      }
      if (insertError || !newDeck) throw insertError || new Error('デッキの複製に失敗しました。');
      if (sourceThumb) setLocalDeckThumb(newDeck.id, sourceThumb);

      if (cardsData && cardsData.length > 0) {
        const records = cardsData.map((c: any) => ({
          deck_id: newDeck.id,
          card_id: c.card_id,
          count: c.count,
        }));
        const { error: copyCardsError } = await supabase.from('deck_cards').insert(records);
        if (copyCardsError) throw copyCardsError;
      }

      await fetchSavedDecksSilent();
      setSelectedDeckForAction(newDeck.id);
      setDeckMessage({ text: `「${copyName}」を作成しました。`, type: 'success' });
    } catch (err: any) {
      console.error(err);
      setDeckMessage({ text: err.message || 'デッキのコピーに失敗しました。', type: 'error' });
    } finally {
      setLoadingDecks(false);
    }
  };

  const deleteSavedDeck = async (deckId: string, targetName: string) => {
    if (!window.confirm(`デッキ「${targetName}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    try {
      setLoadingDecks(true);
      await supabase.from('deck_cards').delete().eq('deck_id', deckId);
      const { error } = await supabase.from('decks').delete().eq('id', deckId);
      if (error) throw error;

      if (currentDeckId === deckId) {
        setCurrentDeckId(null);
        setDeckName('新規デッキ');
        setDeckCards({});
      }
      if (selectedDeckForAction === deckId) {
        setSelectedDeckForAction(null);
      }
      await fetchSavedDecksSilent();
      setDeckMessage({ text: `「${targetName}」を削除しました。`, type: 'success' });
    } catch (err: any) {
      console.error(err);
      setDeckMessage({ text: err.message || 'デッキの削除に失敗しました。', type: 'error' });
    } finally {
      setLoadingDecks(false);
    }
  };

  const openThumbnailPickerBeforeSave = () => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (totalDeckCardCount === 0) {
      setDeckMessage({ text: 'デッキにカードが1枚も入っていません。', type: 'error' });
      return;
    }
    const deckCardIds = Object.keys(deckCards);
    if (!thumbnailCardId || !deckCardIds.includes(thumbnailCardId)) {
      setThumbnailCardId(deckCardIds[0] || null);
    }
    setIsThumbnailModalOpen(true);
  };

  const saveDeckToDB = async (chosenThumbId?: string | null) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (totalDeckCardCount === 0) {
      setDeckMessage({ text: 'デッキにカードが1枚も入っていません。', type: 'error' });
      return;
    }
    const finalThumbId = chosenThumbId !== undefined ? chosenThumbId : thumbnailCardId;
    try {
      setDeckSaving(true);
      let targetDeckId = currentDeckId;
      if (targetDeckId) {
        const { error: updErr } = await supabase
          .from('decks')
          .update({ name: deckName, thumbnail_card_id: finalThumbId, updated_at: new Date().toISOString() })
          .eq('id', targetDeckId);
        if (updErr) {
          await supabase.from('decks').update({ name: deckName, updated_at: new Date().toISOString() }).eq('id', targetDeckId);
        }
        await supabase.from('deck_cards').delete().eq('deck_id', targetDeckId);
      } else {
        let { data: deck, error } = await supabase
          .from('decks')
          .insert({ user_id: user.id, name: deckName, thumbnail_card_id: finalThumbId })
          .select()
          .single();
        if (error) {
          const fallback = await supabase.from('decks').insert({ user_id: user.id, name: deckName }).select().single();
          deck = fallback.data;
          error = fallback.error;
        }
        if (error || !deck) throw error;
        targetDeckId = deck.id;
        setCurrentDeckId(deck.id);
      }
      if (targetDeckId) {
        setLocalDeckThumb(targetDeckId, finalThumbId || null);
      }
      const records = Object.entries(deckCards).map(([cardId, count]) => ({
        deck_id: targetDeckId!,
        card_id: cardId,
        count,
      }));
      await supabase.from('deck_cards').insert(records);
      setIsThumbnailModalOpen(false);
      setDeckMessage({
        text: totalDeckCardCount >= BASE_DECK_LIMIT
          ? `デッキ「${deckName}」を保存しました（${totalDeckCardCount}枚）！`
          : `下書き保存しました（現在: ${totalDeckCardCount}枚）。`,
        type: 'success',
      });
      await loadSavedDecks();
    } catch (err: any) {
      setDeckMessage({ text: err.message || 'デッキの保存に失敗しました。', type: 'error' });
    } finally {
      setDeckSaving(false);
    }
  };

  const loadSavedDecks = async () => {
    setDeckTabScreen('list');
    setSelectedDeckForAction(null);
    await fetchSavedDecksSilent();
  };

  const loadDeckToBuilder = async (deckId: string) => {
    try {
      setLoadingDecks(true);
      let { data: deckData, error: deckError } = await supabase
        .from('decks')
        .select('id, name, thumbnail_card_id')
        .eq('id', deckId)
        .single();
      if (deckError) {
        const fallback = await supabase.from('decks').select('id, name').eq('id', deckId).single();
        deckData = fallback.data as any;
        deckError = fallback.error;
      }

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
      const restoredThumb = (deckData as any).thumbnail_card_id || getLocalDeckThumbs()[deckData.id] || Object.keys(cardMap)[0] || null;
      setThumbnailCardId(restoredThumb);
      setIsDeckListOpen(false);
      setDeckTabScreen('editor');
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
  const startSimulator = (overrideCards?: unknown) => {
    const allSourceCards: Card[] = Array.isArray(overrideCards)
      ? (overrideCards as Card[])
      : [
          ...deckCardsByZone.main,
          ...deckCardsByZone.hyperspatial,
          ...deckCardsByZone.gr,
          ...deckCardsByZone.special,
        ];

    const mainCards = allSourceCards.filter((c) => getCardDeckZone(c) === 'main');
    const hyperCards = allSourceCards.filter((c) => getCardDeckZone(c) === 'hyperspatial');
    const grCards = allSourceCards.filter((c) => getCardDeckZone(c) === 'gr');
    const specialCards = allSourceCards.filter((c) => getCardDeckZone(c) === 'special');

    if (mainCards.length === 0) {
      setDeckMessage({ text: '一人回しを開始するにはメインデッキに最低1枚以上のカードが必要です。', type: 'error' });
      return;
    }

    const toInstances = (list: Card[], prefix: string): SimCardInstance[] =>
      list.map((c, i) => ({
        instanceId: `${prefix}-${c.id}-${i}-${Math.random()}`,
        card: c,
        isTapped: false,
        summonedTurn: 0,
      }));

    const shuffledMain = shuffleSimList(toInstances(mainCards, 'main'));
    const hyperInstances = toInstances(hyperCards, 'hs');
    const shuffledGr = shuffleSimList(toInstances(grCards, 'gr'));
    const specialInstances = toInstances(specialCards, 'sp');

    const shields = shuffledMain.slice(0, 5);
    const hand = shuffledMain.slice(5, 10);
    let remainingDeck = shuffledMain.slice(10);

    // 禁断・ドルマゲドンがある場合は山札の上から4枚を封印としてセット
    const hasSealedSpecial = specialInstances.some((inst) => {
      const text = `${inst.card.name} ${inst.card.card_type}`.normalize('NFKC');
      return text.includes('禁断') || text.includes('ドキンダム') || text.includes('ドルマゲドン') || text.includes('FORBIDDEN');
    });
    const initialSeals = hasSealedSpecial ? remainingDeck.slice(0, Math.min(4, remainingDeck.length)) : [];
    if (initialSeals.length > 0) {
      remainingDeck = remainingDeck.slice(initialSeals.length);
    }

    setSimTurn(1);
    setCurrentPhase('mana');
    setHasChargedManaThisTurn(false);
    setHoveredCard(null);
    setSpellTargetModal(null);
    setExternalZoneModal(null);

    setSimShields(shields);
    setSimHand(hand);
    setSimDeck(remainingDeck);
    setSimBattleZone([]);
    setSimMana([]);
    setSimGraveyard([]);

    setSimHyperspatial(hyperInstances);
    setSimGrZone(shuffledGr);
    setSimSpecialZone(specialInstances);
    setSimSeals(initialSeals);
    setSimSpecialLiberated(false);
    setSimZeronRituals({ resurrection: false, graveyard: false, hand: false, destruction: false });

    const extraNotes: string[] = [];
    if (hyperInstances.length > 0) extraNotes.push(`超次元${hyperInstances.length}枚`);
    if (shuffledGr.length > 0) extraNotes.push(`GR${shuffledGr.length}枚`);
    if (specialInstances.length > 0) {
      extraNotes.push(
        initialSeals.length > 0
          ? `禁断/ドルマゲドン（封印${initialSeals.length}枚セット済）`
          : `ゼーロン/特殊ゾーン${specialInstances.length}枚`
      );
    }

    setSimGameMessage(
      `一人回し開始！手札5枚・シールド5枚でスタート${extraNotes.length > 0 ? `（${extraNotes.join(' / ')}）` : ''}。`
    );
    setIsSimulatorOpen(true);
  };

  // 超次元・GR・禁断/ドルマゲドン/ゼーロン専用アクション
  const summonFromHyperspatial = (inst: SimCardInstance) => {
    setSimHyperspatial((prev) => prev.filter((c) => c.instanceId !== inst.instanceId));
    setSimBattleZone((prev) => [...prev, { ...inst, isTapped: false, summonedTurn: simTurn }]);
    setSimGameMessage(`🌌 超次元ゾーンから「${inst.card.name}」をバトルゾーンに出しました！`);
  };

  const returnBattleCardToExternal = (inst: SimCardInstance) => {
    const zone = getCardDeckZone(inst.card);
    setSimBattleZone((prev) => prev.filter((c) => c.instanceId !== inst.instanceId));
    if (zone === 'hyperspatial') {
      setSimHyperspatial((prev) => [...prev, { ...inst, isTapped: false }]);
      setSimGameMessage(`🌌 「${inst.card.name}」を超次元ゾーンに戻しました。`);
    } else if (zone === 'gr') {
      setSimGrZone((prev) => [...prev, { ...inst, isTapped: false }]);
      setSimGameMessage(`🎲 「${inst.card.name}」をGRゾーンの一番下に戻しました。`);
    } else if (zone === 'special') {
      setSimSpecialZone((prev) => [...prev, { ...inst, isTapped: false }]);
      setSimSpecialLiberated(false);
      setSimGameMessage(`🔥 「${inst.card.name}」を専用ゾーンに戻しました。`);
    }
  };

  const summonGrTop = () => {
    if (simGrZone.length === 0) {
      setSimGameMessage('GRゾーンにカードがありません。');
      return;
    }
    const top = simGrZone[0];
    setSimGrZone((prev) => prev.slice(1));
    setSimBattleZone((prev) => [...prev, { ...top, isTapped: false, summonedTurn: simTurn }]);
    setSimGameMessage(`🎲 GR召喚！「${top.card.name}」がバトルゾーンに出ました！`);
  };

  const summonGrSpecific = (inst: SimCardInstance) => {
    setSimGrZone((prev) => prev.filter((c) => c.instanceId !== inst.instanceId));
    setSimBattleZone((prev) => [...prev, { ...inst, isTapped: false, summonedTurn: simTurn }]);
    setSimGameMessage(`🎲 GRゾーンから「${inst.card.name}」をバトルゾーンに出しました！`);
  };

  const removeOneSeal = () => {
    if (simSeals.length === 0) {
      setSimGameMessage('外せる封印がありません。');
      return;
    }
    const removed = simSeals[0];
    const nextSeals = simSeals.slice(1);
    setSimSeals(nextSeals);
    setSimGraveyard((prev) => [removed, ...prev]);
    if (nextSeals.length === 0) {
      setSimGameMessage(`💥 最後の封印「${removed.card.name}」が外れました！禁断解放が可能です！`);
    } else {
      setSimGameMessage(`🔓 封印を1枚墓地に置きました（-${removed.card.name} / 残り封印: ${nextSeals.length}枚）。`);
    }
  };

  const liberateSpecialZone = () => {
    if (simSpecialZone.length === 0) return;
    const toMove = simSpecialZone.map((c) => ({ ...c, isTapped: false, summonedTurn: simTurn }));
    setSimSpecialZone([]);
    setSimBattleZone((prev) => [...prev, ...toMove]);
    setSimSpecialLiberated(true);
    setSimGameMessage(`🔥 禁断解放／零龍卍誕！「${toMove.map((c) => c.card.name).join(' / ')}」がバトルゾーンに降臨しました！`);
    setExternalZoneModal(null);
  };

  const startSimulatorForSavedDeck = async (deckId: string) => {
    try {
      setLoadingDecks(true);
      const { data: cardsData, error: cardsError } = await supabase
        .from('deck_cards')
        .select('card_id, count')
        .eq('deck_id', deckId);
      if (cardsError) throw cardsError;

      const cardById = new Map(cards.map((c) => [c.id, c]));
      const loadedCards: Card[] = [];
      (cardsData || []).forEach((row) => {
        const found = cardById.get(row.card_id);
        if (found) {
          for (let i = 0; i < row.count; i++) {
            loadedCards.push(found);
          }
        }
      });

      if (loadedCards.length === 0) {
        setDeckMessage({ text: 'このデッキにはカードが入っていないため一人回しを開始できません。', type: 'error' });
        return;
      }
      startSimulator(loadedCards);
    } catch (err: any) {
      console.error(err);
      setDeckMessage({ text: err.message || '一人回しの読み込みに失敗しました。', type: 'error' });
    } finally {
      setLoadingDecks(false);
    }
  };

  // ---------------- 城／G城の要塞化（新しいシールドとして置く） ----------------
  const fortifyCastle = (castleInstance: SimCardInstance) => {
    setSimHand((prev) => prev.filter((c) => c.instanceId !== castleInstance.instanceId));
    setSimShields((prev) => [...prev, { ...castleInstance, isTapped: false }]);
    setSimGameMessage(`🏰 「${castleInstance.card.name}」をシールドゾーンに新しいシールドとして置きました！`);
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

  const shuffleSimList = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const openDeckActionModal = () => {
    const defaultCount = Math.min(3, Math.max(1, simDeck.length));
    setDeckActionModal({
      step: 'config',
      peekCount: defaultCount,
      destination: 'hand',
      peekedCards: [],
      selectedIds: [],
      remainderHandling: 'bottom_shuffle',
    });
  };

  const startDeckPeek = () => {
    if (!deckActionModal) return;
    if (simDeck.length === 0) {
      setSimGameMessage('山札がありません。');
      setDeckActionModal(null);
      return;
    }
    const count = Math.min(Math.max(1, deckActionModal.peekCount), simDeck.length);
    const peeked = simDeck.slice(0, count);
    setDeckActionModal({
      ...deckActionModal,
      step: 'select',
      peekCount: count,
      peekedCards: peeked,
      selectedIds: [],
    });
  };

  const toggleDeckPeekSelection = (instanceId: string) => {
    if (!deckActionModal) return;
    setDeckActionModal((prev) => {
      if (!prev) return null;
      const exists = prev.selectedIds.includes(instanceId);
      return {
        ...prev,
        selectedIds: exists
          ? prev.selectedIds.filter((id) => id !== instanceId)
          : [...prev.selectedIds, instanceId],
      };
    });
  };

  const executeDeckPeekAction = () => {
    if (!deckActionModal) return;
    const { peekedCards, selectedIds, destination, remainderHandling } = deckActionModal;
    const selectedCards = selectedIds
      .map((id) => peekedCards.find((c) => c.instanceId === id))
      .filter((c): c is SimCardInstance => Boolean(c));
    const selectedSet = new Set(selectedIds);
    const remainingPeeked = peekedCards.filter((c) => !selectedSet.has(c.instanceId));
    const untouchedDeck = simDeck.slice(peekedCards.length);

    if (selectedCards.length > 0) {
      const cleanCards = selectedCards.map((c) => ({ ...c, isTapped: false }));
      if (destination === 'hand') {
        setSimHand((prev) => [...prev, ...cleanCards]);
      } else if (destination === 'mana') {
        setSimMana((prev) => [...prev, ...cleanCards]);
      } else if (destination === 'graveyard') {
        setSimGraveyard((prev) => [...cleanCards, ...prev]);
      } else if (destination === 'shield') {
        setSimShields((prev) => [...prev, ...cleanCards]);
      } else if (destination === 'battle') {
        setSimBattleZone((prev) => [
          ...prev,
          ...cleanCards.map((c) => ({ ...c, summonedTurn: simTurn })),
        ]);
      }
    }

    let nextDeck: SimCardInstance[] = [];
    if (remainderHandling === 'bottom_shuffle') {
      nextDeck = [...untouchedDeck, ...shuffleSimList(remainingPeeked)];
    } else if (remainderHandling === 'bottom_order') {
      nextDeck = [...untouchedDeck, ...remainingPeeked];
    } else if (remainderHandling === 'top_order') {
      nextDeck = [...remainingPeeked, ...untouchedDeck];
    } else {
      nextDeck = shuffleSimList([...untouchedDeck, ...remainingPeeked]);
    }
    setSimDeck(nextDeck);

    const destLabelMap: Record<DeckPeekDestination, string> = {
      hand: '手札',
      mana: 'マナゾーン',
      graveyard: '墓地',
      shield: 'シールド',
      battle: 'バトルゾーン',
    };
    setSimGameMessage(
      `山札から${peekedCards.length}枚見て、${selectedCards.length}枚を${destLabelMap[destination]}へ送りました。`
    );
    setDeckActionModal(null);
  };

  const openZoneActionModal = (zone: 'graveyard' | 'mana') => {
    setZoneActionModal({
      zone,
      action: 'hand',
      deckPosition: 'bottom',
      selectedIds: [],
    });
  };

  const toggleZoneSelection = (instanceId: string) => {
    setZoneActionModal((prev) => {
      if (!prev) return null;
      const exists = prev.selectedIds.includes(instanceId);
      return {
        ...prev,
        selectedIds: exists
          ? prev.selectedIds.filter((id) => id !== instanceId)
          : [...prev.selectedIds, instanceId],
      };
    });
  };

  const executeZoneMoveAction = () => {
    if (!zoneActionModal) return;
    const { zone, action, deckPosition, selectedIds } = zoneActionModal;
    const sourceList = zone === 'graveyard' ? simGraveyard : simMana;
    const selectedCards = selectedIds
      .map((id) => sourceList.find((c) => c.instanceId === id))
      .filter((c): c is SimCardInstance => Boolean(c));

    if (selectedCards.length === 0) return;

    const selectedSet = new Set(selectedIds);
    const remainingSource = sourceList.filter((c) => !selectedSet.has(c.instanceId));
    if (zone === 'graveyard') {
      setSimGraveyard(remainingSource);
    } else {
      setSimMana(remainingSource);
    }

    const cleanCards = selectedCards.map((c) => ({ ...c, isTapped: false }));
    const zoneLabel = zone === 'graveyard' ? '墓地' : 'マナ';
    let detailText = '';

    if (action === 'hand') {
      setSimHand((prev) => [...prev, ...cleanCards]);
      detailText = `${selectedCards.length}枚を手札に加えました`;
    } else if (action === 'mana') {
      setSimMana((prev) => [...prev, ...cleanCards]);
      detailText = `${selectedCards.length}枚をマナに加えました`;
    } else if (action === 'shield') {
      setSimShields((prev) => [...prev, ...cleanCards]);
      detailText = `${selectedCards.length}枚をシールドに加えました`;
    } else if (action === 'battle') {
      setSimBattleZone((prev) => [
        ...prev,
        ...cleanCards.map((c) => ({ ...c, summonedTurn: simTurn })),
      ]);
      detailText = `${selectedCards.length}枚をバトルゾーンに出しました`;
    } else if (action === 'deck_shuffle_pos') {
      const shuffled = shuffleSimList(cleanCards);
      setSimDeck((prev) => (deckPosition === 'top' ? [...shuffled, ...prev] : [...prev, ...shuffled]));
      detailText = `${selectedCards.length}枚をシャッフルし山札の${deckPosition === 'top' ? '上' : '下'}に加えました`;
    } else if (action === 'deck_order_pos') {
      setSimDeck((prev) => (deckPosition === 'top' ? [...cleanCards, ...prev] : [...prev, ...cleanCards]));
      detailText = `${selectedCards.length}枚を指定順で山札の${deckPosition === 'top' ? '上' : '下'}に加えました`;
    } else if (action === 'deck_all_shuffle') {
      setSimDeck((prev) => shuffleSimList([...prev, ...cleanCards]));
      detailText = `${selectedCards.length}枚を山札に加えシャッフルしました`;
    }

    setSimGameMessage(`${zoneLabel}から${detailText}。`);
    setZoneActionModal(null);
  };

  const breakOwnShield = (shieldInstance: SimCardInstance) => {
    setSimShields((prev) => prev.filter((s) => s.instanceId !== shieldInstance.instanceId));
    setSimHand((prev) => [...prev, shieldInstance]);
    setSimGameMessage(`🛡️ シールド「${shieldInstance.card.name}」を手札に加えました！`);
  };

  if (!isClientMounted) {
    return <div className="min-h-screen bg-slate-950" />;
  }

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

      {/* ---------------- 山札操作モーダル ---------------- */}
      {deckActionModal && (
        <div
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 cursor-default animate-in fade-in duration-150"
          onClick={() => setDeckActionModal(null)}
        >
          <div
            className="bg-slate-900 border-2 border-blue-500/80 text-white rounded-3xl max-w-2xl w-full p-4 sm:p-5 shadow-2xl space-y-4 max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <DeckIcon className="h-5 w-5 text-blue-400" />
                <h3 className="font-black text-sm">
                  山札の操作（残り {simDeck.length}枚）
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDeckActionModal(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {deckActionModal.step === 'config' ? (
              <div className="space-y-4 overflow-y-auto pr-1">
                {/* クイック基本操作 */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={simDeck.length === 0}
                    onClick={() => {
                      manualDrawOne();
                      setDeckActionModal(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/50 text-cyan-200 text-xs font-bold disabled:opacity-40 cursor-pointer"
                  >
                    1枚ドローする
                  </button>
                  <button
                    type="button"
                    disabled={simDeck.length <= 1}
                    onClick={() => {
                      setSimDeck((prev) => shuffleSimList(prev));
                      setSimGameMessage('🔀 山札をシャッフルしました。');
                      setDeckActionModal(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold disabled:opacity-40 cursor-pointer"
                  >
                    山札をシャッフルする
                  </button>
                </div>

                {/* 見る枚数指定 */}
                <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-300">① 山札の上から何枚見ますか？</span>
                    <span className="text-xs font-black text-white">
                      {Math.min(deckActionModal.peekCount, simDeck.length)} 枚見る
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        disabled={simDeck.length === 0}
                        onClick={() =>
                          setDeckActionModal((prev) =>
                            prev ? { ...prev, peekCount: Math.min(num, Math.max(1, simDeck.length)) } : null
                          )
                        }
                        className={`w-8 h-8 rounded-lg text-xs font-black border transition cursor-pointer ${
                          deckActionModal.peekCount === num
                            ? 'bg-blue-600 border-blue-400 text-white'
                            : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-blue-500'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={simDeck.length === 0}
                      onClick={() =>
                        setDeckActionModal((prev) =>
                          prev ? { ...prev, peekCount: Math.max(1, simDeck.length) } : null
                        )
                      }
                      className={`px-2.5 h-8 rounded-lg text-xs font-black border transition cursor-pointer ${
                        deckActionModal.peekCount === simDeck.length && simDeck.length > 0
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-blue-500'
                      }`}
                    >
                      山札すべて ({simDeck.length})
                    </button>
                  </div>
                </div>

                {/* 見た後の移動先指定 */}
                <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2">
                  <span className="block text-xs font-bold text-blue-300">② 見たカードから選んでどうしますか？</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(
                      [
                        { key: 'hand', label: 'n枚カードを見て n枚手札に加える' },
                        { key: 'mana', label: 'n枚カードを見て n枚マナに加える' },
                        { key: 'graveyard', label: 'n枚カードを見て n枚墓地に加える' },
                        { key: 'shield', label: 'n枚カードを見て n枚シールドに加える' },
                        { key: 'battle', label: 'n枚カードを見て n枚バトルゾーンに出す' },
                      ] as { key: DeckPeekDestination; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          setDeckActionModal((prev) => (prev ? { ...prev, destination: opt.key } : null))
                        }
                        className={`p-2.5 rounded-xl border text-left text-xs font-bold transition cursor-pointer ${
                          deckActionModal.destination === opt.key
                            ? 'bg-blue-600/25 border-blue-400 text-white shadow-sm'
                            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={simDeck.length === 0}
                  onClick={startDeckPeek}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-black text-xs transition shadow-md cursor-pointer"
                >
                  山札の上から {Math.min(deckActionModal.peekCount, simDeck.length)} 枚を見る
                </button>
              </div>
            ) : (
              <div className="flex flex-col space-y-3 overflow-hidden flex-1">
                <div className="flex items-center justify-between text-xs bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 shrink-0">
                  <span className="text-slate-300">
                    移動先:{' '}
                    <strong className="text-blue-300">
                      {
                        {
                          hand: '手札に加える',
                          mana: 'マナに加える',
                          graveyard: '墓地に加える',
                          shield: 'シールドに加える',
                          battle: 'バトルゾーンに出す',
                        }[deckActionModal.destination]
                      }
                    </strong>
                  </span>
                  <span className="font-black text-emerald-400">
                    選択中: {deckActionModal.selectedIds.length} / {deckActionModal.peekedCards.length} 枚
                  </span>
                </div>

                <div className="overflow-y-auto flex-1 pr-1">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {deckActionModal.peekedCards.map((c, idx) => {
                      const selIdx = deckActionModal.selectedIds.indexOf(c.instanceId);
                      const isSelected = selIdx !== -1;
                      return (
                        <div
                          key={c.instanceId}
                          onClick={() => toggleDeckPeekSelection(c.instanceId)}
                          onMouseEnter={() => setHoveredCard(c.card)}
                          onMouseLeave={() => setHoveredCard(null)}
                          className={`p-1.5 rounded-xl border-2 cursor-pointer transition flex flex-col items-center gap-1 relative ${
                            isSelected
                              ? 'bg-blue-950/60 border-blue-400 shadow-md'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-slate-300 z-10">
                            上から{idx + 1}
                          </span>
                          {isSelected && (
                            <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-black flex items-center justify-center shadow z-10">
                              {selIdx + 1}
                            </span>
                          )}
                          <div className="aspect-[3/4] w-full rounded overflow-hidden bg-slate-900">
                            {c.card.image_url ? (
                              <img src={c.card.image_url} alt="" className="w-full h-full object-cover" />
                            ) : null}
                          </div>
                          <span className="text-[9px] font-bold truncate w-full text-center">{c.card.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 残りのカードの戻し方 */}
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 shrink-0">
                  <span className="block text-[11px] font-bold text-slate-300">
                    選ばなかった残り（{deckActionModal.peekedCards.length - deckActionModal.selectedIds.length}枚）の処理:
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { key: 'bottom_shuffle', label: 'シャッフルして山札の下へ' },
                        { key: 'bottom_order', label: 'そのままの順で山札の下へ' },
                        { key: 'top_order', label: 'そのままの順で山札の上へ' },
                        { key: 'deck_shuffle', label: '山札に戻し全体をシャッフル' },
                      ] as { key: DeckRemainderHandling; label: string }[]
                    ).map((rem) => (
                      <button
                        key={rem.key}
                        type="button"
                        onClick={() =>
                          setDeckActionModal((prev) => (prev ? { ...prev, remainderHandling: rem.key } : null))
                        }
                        className={`px-2 py-1.5 rounded-lg border text-[10px] font-bold transition cursor-pointer ${
                          deckActionModal.remainderHandling === rem.key
                            ? 'bg-indigo-600/30 border-indigo-400 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {rem.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDeckActionModal((prev) => (prev ? { ...prev, step: 'config' } : null))}
                    className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                  >
                    戻る
                  </button>
                  <button
                    type="button"
                    onClick={executeDeckPeekAction}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-md cursor-pointer"
                  >
                    確定（{deckActionModal.selectedIds.length}枚を移動する）
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- 墓地・マナ操作モーダル ---------------- */}
      {zoneActionModal && (() => {
        const isGraveyard = zoneActionModal.zone === 'graveyard';
        const zoneCards = isGraveyard ? simGraveyard : simMana;
        const zoneName = isGraveyard ? '墓地' : 'マナゾーン';
        const needsTopBottom =
          zoneActionModal.action === 'deck_shuffle_pos' || zoneActionModal.action === 'deck_order_pos';

        const actionOptions: { key: ZoneMoveAction; label: string }[] = isGraveyard
          ? [
              { key: 'hand', label: 'n枚手札に加える' },
              { key: 'mana', label: 'n枚マナに加える' },
              { key: 'deck_shuffle_pos', label: 'n枚シャッフルし山札（上or下）に加える' },
              { key: 'deck_order_pos', label: 'n枚順番を指定し山札（上or下）に加える' },
              { key: 'deck_all_shuffle', label: 'n枚山札に加えシャッフルする' },
              { key: 'shield', label: 'n枚シールドに加える' },
              { key: 'battle', label: 'n枚バトルゾーンに出す' },
            ]
          : [
              { key: 'hand', label: 'n枚手札に加える' },
              { key: 'deck_shuffle_pos', label: 'n枚シャッフルし山札（上or下）に加える' },
              { key: 'deck_order_pos', label: 'n枚順番を指定し山札（上or下）に加える' },
              { key: 'deck_all_shuffle', label: 'n枚山札に加えシャッフルする' },
              { key: 'shield', label: 'n枚シールドに加える' },
              { key: 'battle', label: 'n枚バトルゾーンに出す' },
            ];

        return (
          <div
            className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 cursor-default animate-in fade-in duration-150"
            onClick={() => setZoneActionModal(null)}
          >
            <div
              className={`bg-slate-900 border-2 ${
                isGraveyard ? 'border-purple-500/80' : 'border-emerald-500/80'
              } text-white rounded-3xl max-w-2xl w-full p-4 sm:p-5 shadow-2xl space-y-3.5 max-h-[88vh] flex flex-col`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <Skull className={`h-5 w-5 ${isGraveyard ? 'text-purple-400' : 'text-emerald-400'}`} />
                  <h3 className="font-black text-sm">
                    {zoneName}の操作（{zoneCards.length}枚）
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setZoneActionModal(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* アクション選択 */}
              <div className="space-y-2 shrink-0">
                <span className="block text-[11px] font-bold text-slate-300">① 実行する操作を選択:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {actionOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() =>
                        setZoneActionModal((prev) => (prev ? { ...prev, action: opt.key } : null))
                      }
                      className={`px-2.5 py-2 rounded-xl border text-left text-[11px] font-bold transition cursor-pointer ${
                        zoneActionModal.action === opt.key
                          ? isGraveyard
                            ? 'bg-purple-600/30 border-purple-400 text-white'
                            : 'bg-emerald-600/30 border-emerald-400 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {needsTopBottom && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] font-bold text-slate-300">山札のどこに加えますか？</span>
                    <button
                      type="button"
                      onClick={() =>
                        setZoneActionModal((prev) => (prev ? { ...prev, deckPosition: 'top' } : null))
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-black border cursor-pointer ${
                        zoneActionModal.deckPosition === 'top'
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-slate-950 border-slate-700 text-slate-400'
                      }`}
                    >
                      山札の上（トップ）
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setZoneActionModal((prev) => (prev ? { ...prev, deckPosition: 'bottom' } : null))
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-black border cursor-pointer ${
                        zoneActionModal.deckPosition === 'bottom'
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-slate-950 border-slate-700 text-slate-400'
                      }`}
                    >
                      山札の下（ボトム）
                    </button>
                  </div>
                )}
              </div>

              {/* 対象カード複数・順番選択 */}
              <div className="flex items-center justify-between text-[11px] shrink-0 pt-1 border-t border-slate-800">
                <span className="font-bold text-slate-300">
                  ② 対象のカードをタップして選択（選択した順に番号が付きます）:
                </span>
                <div className="flex items-center gap-2">
                  {zoneActionModal.selectedIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setZoneActionModal((prev) => (prev ? { ...prev, selectedIds: [] } : null))
                      }
                      className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      選択解除
                    </button>
                  )}
                  <span className="font-black text-amber-300">
                    選択中: {zoneActionModal.selectedIds.length}枚
                  </span>
                </div>
              </div>

              <div className="overflow-y-auto flex-1 pr-1">
                {zoneCards.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-500">{zoneName}にカードはありません。</div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {zoneCards.map((c, idx) => {
                      const selIdx = zoneActionModal.selectedIds.indexOf(c.instanceId);
                      const isSelected = selIdx !== -1;
                      return (
                        <div
                          key={`${c.instanceId}-${idx}`}
                          onClick={() => toggleZoneSelection(c.instanceId)}
                          onMouseEnter={() => setHoveredCard(c.card)}
                          onMouseLeave={() => setHoveredCard(null)}
                          className={`p-1.5 rounded-xl border-2 cursor-pointer transition flex flex-col items-center gap-1 relative ${
                            isSelected
                              ? isGraveyard
                                ? 'bg-purple-950/60 border-purple-400 shadow-md'
                                : 'bg-emerald-950/60 border-emerald-400 shadow-md'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          {isSelected && (
                            <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black flex items-center justify-center shadow z-10">
                              {selIdx + 1}
                            </span>
                          )}
                          <div className="aspect-[3/4] w-full rounded overflow-hidden bg-slate-900">
                            {c.card.image_url ? (
                              <img src={c.card.image_url} alt="" className="w-full h-full object-cover" />
                            ) : null}
                          </div>
                          <span className="text-[8px] font-bold truncate w-full text-center">{c.card.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={zoneActionModal.selectedIds.length === 0}
                onClick={executeZoneMoveAction}
                className={`w-full py-2.5 rounded-xl font-black text-xs text-white transition shadow-md disabled:opacity-40 shrink-0 cursor-pointer ${
                  isGraveyard
                    ? 'bg-purple-600 hover:bg-purple-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                選択した {zoneActionModal.selectedIds.length} 枚に対して実行する
              </button>
            </div>
          </div>
        );
      })()}

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

      {/* ---------------- 超次元・GR・禁断/ドルマゲドン/ゼーロン専用モーダル ---------------- */}
      {externalZoneModal && (
        <div
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 cursor-default animate-in fade-in duration-150"
          onClick={() => setExternalZoneModal(null)}
        >
          <div
            className={`bg-slate-900 border-2 ${
              externalZoneModal === 'hyperspatial'
                ? 'border-indigo-500/80'
                : externalZoneModal === 'gr'
                ? 'border-amber-500/80'
                : 'border-rose-500/80'
            } text-white rounded-3xl max-w-2xl w-full p-4 sm:p-5 shadow-2xl space-y-4 max-h-[88vh] flex flex-col`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 shrink-0">
              <h3 className="font-black text-sm flex items-center gap-2">
                {externalZoneModal === 'hyperspatial' && (
                  <span className="text-indigo-300">🌌 超次元ゾーン（残り {simHyperspatial.length}枚）</span>
                )}
                {externalZoneModal === 'gr' && (
                  <span className="text-amber-300">🎲 GRゾーン（残り {simGrZone.length}枚）</span>
                )}
                {externalZoneModal === 'special' && (
                  <span className="text-rose-300">🔥 禁断 / ドルマゲドン / ゼーロン専用ゾーン</span>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setExternalZoneModal(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {externalZoneModal === 'hyperspatial' && (
              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                <p className="text-xs text-slate-300">
                  クリックしたサイキック／ドラグハートをバトルゾーンに出します：
                </p>
                {simHyperspatial.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-500">超次元ゾーンにカードがありません。</div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {simHyperspatial.map((c) => (
                      <div
                        key={c.instanceId}
                        onClick={() => summonFromHyperspatial(c)}
                        onMouseEnter={() => setHoveredCard(c.card)}
                        onMouseLeave={() => setHoveredCard(null)}
                        className="p-1.5 bg-slate-950 border border-indigo-800/80 hover:border-indigo-400 rounded-xl cursor-pointer transition flex flex-col items-center gap-1 group"
                      >
                        <div className="aspect-[3/4] w-full rounded overflow-hidden bg-slate-900">
                          {c.card.image_url ? (
                            <img src={c.card.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                          ) : null}
                        </div>
                        <span className="text-[9px] font-bold truncate w-full text-center">{c.card.name}</span>
                        <span className="w-full py-0.5 rounded bg-indigo-600 text-center text-[9px] font-black text-white">
                          場に出す
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {externalZoneModal === 'gr' && (
              <div className="space-y-3 overflow-y-auto flex-1 pr-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={simGrZone.length === 0}
                    onClick={() => {
                      summonGrTop();
                      setExternalZoneModal(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-xs shadow cursor-pointer"
                  >
                    🎲 GR召喚（上から1枚出す）
                  </button>
                  <button
                    type="button"
                    disabled={simGrZone.length <= 1}
                    onClick={() => {
                      setSimGrZone((prev) => shuffleSimList(prev));
                      setSimGameMessage('🔀 GRゾーンをシャッフルしました。');
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs disabled:opacity-40 cursor-pointer"
                  >
                    GRゾーンをシャッフル
                  </button>
                </div>

                <p className="text-[11px] text-slate-400">
                  カードをクリックすると任意のGRクリーチャーを直接バトルゾーンに出せます（上から順に表示）：
                </p>

                {simGrZone.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-500">GRゾーンにカードがありません。</div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {simGrZone.map((c, idx) => (
                      <div
                        key={c.instanceId}
                        onClick={() => summonGrSpecific(c)}
                        onMouseEnter={() => setHoveredCard(c.card)}
                        onMouseLeave={() => setHoveredCard(null)}
                        className="p-1.5 bg-slate-950 border border-amber-800/70 hover:border-amber-400 rounded-xl cursor-pointer transition flex flex-col items-center gap-1 relative group"
                      >
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/80 text-[9px] font-bold text-amber-300 z-10">
                          #{idx + 1}
                        </span>
                        <div className="aspect-[3/4] w-full rounded overflow-hidden bg-slate-900">
                          {c.card.image_url ? (
                            <img src={c.card.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" />
                          ) : null}
                        </div>
                        <span className="text-[9px] font-bold truncate w-full text-center">{c.card.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {externalZoneModal === 'special' && (
              <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                {/* 登録カード表示 */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {simSpecialZone.map((c) => (
                    <div
                      key={c.instanceId}
                      onMouseEnter={() => setHoveredCard(c.card)}
                      onMouseLeave={() => setHoveredCard(null)}
                      className="p-1.5 bg-slate-950 border border-rose-800/80 rounded-xl flex flex-col items-center gap-1"
                    >
                      <div className="aspect-[3/4] w-full rounded overflow-hidden bg-slate-900">
                        {c.card.image_url ? (
                          <img src={c.card.image_url} alt="" className="w-full h-full object-cover" />
                        ) : null}
                      </div>
                      <span className="text-[8px] font-bold truncate w-full text-center">{c.card.name}</span>
                    </div>
                  ))}
                </div>

                {/* 封印ギミック（禁断 / ドルマゲドンX用） */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-rose-900/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-rose-300">禁断・ドルマゲドン 封印管理</span>
                    <span className="px-2 py-0.5 rounded bg-rose-950 border border-rose-700 text-rose-200 text-xs font-black">
                      残り封印: {simSeals.length} 枚
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={simSeals.length === 0}
                      onClick={removeOneSeal}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-black cursor-pointer"
                    >
                      🔓 封印を1枚外す（墓地へ置く）
                    </button>
                    <button
                      type="button"
                      disabled={simDeck.length === 0}
                      onClick={() => {
                        const top = simDeck[0];
                        setSimDeck((prev) => prev.slice(1));
                        setSimSeals((prev) => [top, ...prev]);
                        setSimGameMessage('🔒 山札の上から1枚を封印として付けました。');
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold disabled:opacity-40 cursor-pointer"
                    >
                      + 封印を1枚付ける
                    </button>
                  </div>
                </div>

                {/* ゼーロン 4つの儀トグル */}
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-purple-900/60 space-y-2">
                  <span className="block text-xs font-black text-purple-300">零龍（ゼーロン）4つの儀の達成状況</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { key: 'resurrection', label: '復活の儀' },
                        { key: 'graveyard', label: '墓地の儀' },
                        { key: 'hand', label: '手札の儀' },
                        { key: 'destruction', label: '破壊の儀' },
                      ] as const
                    ).map((ritual) => {
                      const done = simZeronRituals[ritual.key];
                      return (
                        <button
                          key={ritual.key}
                          type="button"
                          onClick={() =>
                            setSimZeronRituals((prev) => ({ ...prev, [ritual.key]: !prev[ritual.key] }))
                          }
                          className={`py-2 px-2 rounded-xl border text-xs font-black transition cursor-pointer ${
                            done
                              ? 'bg-purple-600 border-purple-300 text-white shadow'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-purple-600'
                          }`}
                        >
                          {done ? `✓ ${ritual.label}` : ritual.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 禁断解放 / 零龍卍誕 実行ボタン */}
                <button
                  type="button"
                  disabled={simSpecialZone.length === 0}
                  onClick={liberateSpecialZone}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 disabled:opacity-40 text-white font-black text-xs shadow-lg cursor-pointer"
                >
                  🔥 禁断解放 ／ 零龍卍誕（バトルゾーンへ降臨させる）
                </button>
              </div>
            )}
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

              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={manualDrawOne}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[11px] font-bold transition cursor-pointer"
                >
                  +1枚ドロー
                </button>

                {simHyperspatial.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExternalZoneModal('hyperspatial')}
                    className="px-2.5 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-600/70 text-[11px] font-extrabold transition cursor-pointer"
                  >
                    🌌 超次元({simHyperspatial.length})
                  </button>
                )}

                {simGrZone.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={summonGrTop}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black transition cursor-pointer"
                    >
                      🎲 GR召喚({simGrZone.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setExternalZoneModal('gr')}
                      title="GRゾーン一覧を見る"
                      className="px-1.5 py-1 rounded-lg bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-600/70 text-[10px] font-bold transition cursor-pointer"
                    >
                      一覧
                    </button>
                  </div>
                )}

                {(simSpecialZone.length > 0 || simSeals.length > 0 || simSpecialLiberated) && (
                  <button
                    type="button"
                    onClick={() => setExternalZoneModal('special')}
                    className="px-2.5 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-500/80 text-[11px] font-extrabold transition cursor-pointer"
                  >
                    🔥 禁断/零龍{simSeals.length > 0 ? `(封印${simSeals.length})` : ''}
                  </button>
                )}

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
                        {getCardDeckZone(c.card) !== 'main' && (
                          <button
                            type="button"
                            onClick={() => returnBattleCardToExternal(c)}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[9px] font-bold text-slate-200 cursor-pointer"
                          >
                            専用ゾーンへ戻す
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2 items-center shrink-0">
                <div className="col-span-3 sm:col-span-2 flex gap-1.5 h-24">
                  <div
                    onClick={openDeckActionModal}
                    title="クリックで山札操作メニューを開く"
                    className="flex-1 rounded-xl border border-blue-900/70 bg-blue-950/50 hover:border-blue-400 flex flex-col items-center justify-center text-center p-1 cursor-pointer transition"
                  >
                    <DeckIcon className="h-4 w-4 text-blue-400 mb-0.5" />
                    <span className="text-[9px] text-slate-300 font-bold">山札</span>
                    <span className="text-sm font-black leading-tight text-white">{simDeck.length}</span>
                    <span className="text-[8px] text-blue-300 font-semibold">操作</span>
                  </div>

                  <div
                    onClick={() => openZoneActionModal('graveyard')}
                    onMouseEnter={() => simGraveyard.length > 0 && setHoveredCard(simGraveyard[0].card)}
                    onMouseLeave={() => setHoveredCard(null)}
                    title="クリックで墓地操作メニューを開く"
                    className="flex-1 rounded-xl border border-purple-900/70 bg-purple-950/50 hover:border-purple-400 flex flex-col items-center justify-center text-center p-1 cursor-pointer transition relative overflow-hidden"
                  >
                    {simGraveyard.length > 0 && simGraveyard[0].card.image_url ? (
                      <img src={simGraveyard[0].card.image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                    ) : null}
                    <Skull className="h-4 w-4 text-purple-400 mb-0.5 relative z-10" />
                    <span className="text-[9px] text-slate-300 font-bold relative z-10">墓地</span>
                    <span className="text-sm font-black leading-tight text-white relative z-10">{simGraveyard.length}</span>
                    <span className="text-[8px] text-purple-300 font-semibold relative z-10">操作</span>
                  </div>
                </div>

                <div className="col-span-5 flex flex-col justify-between h-24 bg-slate-900/60 px-2.5 py-1.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between gap-1 text-[10px] text-emerald-400 font-bold leading-none">
                    <button
                      type="button"
                      onClick={() => openZoneActionModal('mana')}
                      className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-500/40 text-emerald-300 font-extrabold transition cursor-pointer shrink-0"
                    >
                      マナ操作 ▾
                    </button>
                    <span className="truncate">
                      使用可: {simMana.filter((c) => !c.isTapped).length}/{simMana.length}
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
                      {(() => {
                        const cap = getCardPlayCapability(c.card);
                        const isTwin = cap.canBattle && cap.canSpell;
                        return (
                          <div className={`grid ${isTwin ? 'grid-cols-3' : 'grid-cols-2'} gap-1`}>
                            {cap.canBattle && (
                              <button
                                type="button"
                                disabled={currentPhase !== 'main'}
                                onClick={() => {
                                  setSimHand((h) => h.filter((card) => card.instanceId !== c.instanceId));
                                  setSimBattleZone((bz) => [...bz, { ...c, isTapped: false, summonedTurn: simTurn }]);
                                  setSimGameMessage(`「${c.card.name}」をバトルゾーンに出しました（${cap.battleLabel}）！`);
                                }}
                                className="py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white text-[9px] font-bold rounded cursor-pointer"
                              >
                                {cap.battleLabel}
                              </button>
                            )}
                            {cap.canCastle && (
                              <button
                                type="button"
                                disabled={currentPhase !== 'main'}
                                onClick={() => fortifyCastle(c)}
                                className="py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white text-[9px] font-bold rounded cursor-pointer"
                              >
                                要塞化
                              </button>
                            )}
                            {cap.canSpell && (
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
                        );
                      })()}
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

      {/* ---------------- デッキ保存時のサムネイル選択モーダル ---------------- */}
      {isThumbnailModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 cursor-default"
          onClick={() => !deckSaving && setIsThumbnailModalOpen(false)}
        >
          <div
            className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b">
              <div>
                <h2 className="text-lg font-black text-slate-900">デッキのサムネイルを選択</h2>
                <p className="text-xs text-slate-500 mt-0.5">マイデッキ一覧に表示するカードを1枚選んで保存してください</p>
              </div>
              <button
                type="button"
                disabled={deckSaving}
                onClick={() => setIsThumbnailModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {Object.keys(deckCards).map((cardId) => {
                  const card = cards.find((c) => c.id === cardId);
                  if (!card) return null;
                  const isChosen = thumbnailCardId === cardId;
                  return (
                    <button
                      key={cardId}
                      type="button"
                      onClick={() => setThumbnailCardId(cardId)}
                      className={`group relative rounded-xl overflow-hidden border-2 transition text-left cursor-pointer ${
                        isChosen
                          ? 'border-blue-600 ring-2 ring-blue-500/30 shadow-md scale-[1.02]'
                          : 'border-slate-200 hover:border-blue-400'
                      }`}
                    >
                      <div className="aspect-[5/7] bg-slate-100 relative">
                        {card.image_url ? (
                          <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400 p-1 text-center">
                            {card.name}
                          </div>
                        )}
                        {isChosen && (
                          <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </div>
                      <div className={`p-1.5 text-[10px] font-bold truncate ${isChosen ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'}`}>
                        {card.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deckSaving}
                onClick={() => setIsThumbnailModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold transition cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={deckSaving}
                onClick={() => saveDeckToDB(thumbnailCardId)}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer disabled:opacity-50"
              >
                {deckSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                このカードで保存する
              </button>
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
      <header className="border-b bg-white px-3.5 sm:px-6 py-2.5 sm:py-3.5 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
          {/* 上段（PCでは左側＋右側に展開） */}
          <div className="flex items-center justify-between md:justify-start md:gap-6 w-full md:w-auto">
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-base sm:text-lg shadow-md shrink-0">
                DM
              </div>
              <span className="font-extrabold text-base sm:text-lg tracking-tight whitespace-nowrap bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                DM Deck Hub
              </span>
            </div>

            {/* スマホ用の右上アカウント操作（PCでは非表示にして右端へ） */}
            <div className="flex items-center gap-2 md:hidden shrink-0">
              {user ? (
                <>
                  <span className="text-[11px] text-slate-600 inline-flex items-center gap-1 bg-slate-100 py-1 px-2 rounded-full font-semibold max-w-[96px] truncate">
                    <UserIcon className="h-3 w-3 text-slate-500 shrink-0" />
                    <span className="truncate">{myProfile?.display_name || (user.user_metadata?.display_name as string) || user.email}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => supabase.auth.signOut()}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition whitespace-nowrap cursor-pointer"
                  >
                    <LogOut className="h-3 w-3 shrink-0" />
                    ログアウト
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm whitespace-nowrap cursor-pointer"
                >
                  <LogIn className="h-3 w-3 shrink-0" />
                  ログイン
                </button>
              )}
            </div>

            {/* PC用ナビゲーションタブ */}
            <nav className="hidden md:flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('collection')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'collection' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                資産管理
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('deck');
                  setDeckTabScreen('list');
                  setSelectedDeckForAction(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'deck' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                デッキ構築
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
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer relative ${
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
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  activeTab === 'settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                設定
              </button>
            </nav>
          </div>

          {/* スマホ用4列均等ナビゲーションタブ（縦書き折り返し防止） */}
          <nav className="grid grid-cols-4 gap-1 md:hidden bg-slate-100 p-1 rounded-xl w-full">
            <button
              type="button"
              onClick={() => setActiveTab('collection')}
              className={`py-1.5 px-1 text-[11px] font-bold rounded-lg transition-all text-center whitespace-nowrap cursor-pointer ${
                activeTab === 'collection' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              資産管理
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('deck');
                setDeckTabScreen('list');
                setSelectedDeckForAction(null);
              }}
              className={`py-1.5 px-1 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer ${
                activeTab === 'deck' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Layers className="h-3 w-3 shrink-0" />
              デッキ構築
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
              className={`py-1.5 px-1 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer relative ${
                activeTab === 'friends' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              <Users className="h-3 w-3 shrink-0" />
              フレンド
              {pendingNotificationCount > 0 && (
                <span className="px-1 rounded-full text-[9px] bg-rose-500 text-white font-black">
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
              className={`py-1.5 px-1 text-[11px] font-bold rounded-lg transition-all text-center whitespace-nowrap cursor-pointer ${
                activeTab === 'settings' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600'
              }`}
            >
              設定
            </button>
          </nav>

          {/* PC用右端アカウント欄 */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600 inline-flex items-center gap-1.5 bg-slate-100 py-1.5 px-3 rounded-full font-medium">
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
          cards={cards}
          counts={counts}
          onCountsUpdated={(updated) => setCounts(updated)}
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
      ) : activeTab === 'deck' && deckTabScreen === 'list' ? (
        /* ================ デッキ構築：作成済みデッキ一覧画面 ================ */
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <DeckIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">マイデッキ一覧</h2>
                  <p className="text-xs text-slate-500">デッキを選択すると「編集」「コピー」「削除」ができます</p>
                </div>
              </div>
              <button
                type="button"
                onClick={startNewDeck}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                新規作成
              </button>
            </div>

            {deckMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between ${
                  deckMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}
              >
                <span>{deckMessage.text}</span>
                <button type="button" onClick={() => setDeckMessage(null)} className="text-current opacity-60 hover:opacity-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {!user ? (
              <div className="text-center py-12 space-y-4">
                <p className="text-sm text-slate-500">作成済みデッキの保存・一覧表示にはログインが必要です（未ログインでも新規作成からデッキ構築を試せます）。</p>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAuthModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
                  >
                    ログイン / 新規登録
                  </button>
                  <button
                    type="button"
                    onClick={startNewDeck}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus className="h-4 w-4" />
                    新規作成を始める
                  </button>
                </div>
              </div>
            ) : loadingDecks ? (
              <div className="text-center py-14 text-slate-400 text-sm font-medium">デッキ一覧を読み込み中...</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 新規作成カード */}
                <button
                  type="button"
                  onClick={startNewDeck}
                  className="p-5 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-50 hover:border-blue-500 transition flex flex-col items-center justify-center gap-2 min-h-[148px] text-blue-700 cursor-pointer group"
                >
                  <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition">
                    <Plus className="h-6 w-6" />
                  </div>
                  <span className="font-black text-sm">新規作成</span>
                  <span className="text-[11px] text-blue-600/80">新しいデッキをゼロから構築</span>
                </button>

                {/* 作成済みデッキカード */}
                {savedDecks.map((deck) => {
                  const isSelected = selectedDeckForAction === deck.id;
                  const thumbCard = deck.thumbnail_card_id ? cards.find((c) => c.id === deck.thumbnail_card_id) : null;
                  return (
                    <div
                      key={deck.id}
                      onClick={() => setSelectedDeckForAction(isSelected ? null : deck.id)}
                      className={`p-4 rounded-2xl border transition flex flex-col justify-between min-h-[160px] cursor-pointer ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 shadow-md'
                          : 'border-slate-200 bg-white hover:border-blue-400 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-14 h-20 rounded-xl bg-slate-100 border border-slate-200/80 overflow-hidden shrink-0 flex items-center justify-center shadow-xs">
                          {thumbCard?.image_url ? (
                            <img
                              src={thumbCard.image_url}
                              alt={thumbCard.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <DeckIcon className="h-5 w-5 text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1.5">
                            <h3 className="font-black text-sm text-slate-900 line-clamp-2">{deck.name}</h3>
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                deck.total_cards >= BASE_DECK_LIMIT
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {deck.total_cards}枚
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            作成日: {new Date(deck.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {isSelected ? (
                        <div
                          className="pt-3 mt-3 border-t border-blue-200/80 grid grid-cols-2 sm:grid-cols-4 gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => loadDeckToBuilder(deck.id)}
                            className="py-2 px-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 shadow-sm transition cursor-pointer"
                          >
                            <Edit3 className="h-3 w-3 shrink-0" />
                            編集
                          </button>
                          <button
                            type="button"
                            onClick={() => startSimulatorForSavedDeck(deck.id)}
                            className="py-2 px-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 shadow-sm transition cursor-pointer"
                          >
                            <Play className="h-3 w-3 shrink-0" />
                            一人回し
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateSavedDeck(deck.id, deck.name)}
                            className="py-2 px-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center gap-1 shadow-sm transition cursor-pointer"
                          >
                            <Copy className="h-3 w-3 shrink-0" />
                            コピー
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteSavedDeck(deck.id, deck.name)}
                            className="py-2 px-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 shadow-sm transition cursor-pointer"
                          >
                            <Trash2 className="h-3 w-3 shrink-0" />
                            削除
                          </button>
                        </div>
                      ) : (
                        <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                          <span>クリックして操作を選択</span>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================ タブ1・2: 資産管理＆デッキ構築エディタ画面 ================ */
        <div className={`max-w-7xl mx-auto px-3 sm:px-6 pt-4 sm:pt-6 ${activeTab === 'deck' ? 'flex flex-col lg:grid lg:grid-cols-12 gap-4 lg:gap-6 lg:h-[calc(100vh-4.25rem)] lg:overflow-hidden lg:pb-4' : 'grid grid-cols-1 lg:grid-cols-12 gap-6'}`}>
          <section ref={cardListTopRef} className={`${activeTab === 'deck' ? 'order-2 lg:order-1 lg:col-span-6 lg:h-full lg:min-h-0 lg:overflow-hidden' : 'lg:col-span-12'} flex flex-col gap-3 sm:gap-4 scroll-mt-20`}>
            <div className={`${activeTab === 'deck' ? 'order-2 lg:order-1 shrink-0' : ''} bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap gap-2 sm:gap-2.5 items-center`}>
              <div className="relative flex-1 min-w-[130px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="カード名..."
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                {searchName && (
                  <button
                    type="button"
                    onClick={() => setSearchName('')}
                    title="検索テキストをクリア"
                    aria-label="検索テキストをクリア"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
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
                <option value="火">火文明</option>
                <option value="水">水文明</option>
                <option value="自然">自然文明</option>
                <option value="光">光文明</option>
                <option value="闇">闇文明</option>
                <option value="multicolor">多色（レインボー）</option>
                <option value="zero">零文明（無色）</option>
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

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "release" | "name" | "civilization" | "cost" | "rarity")}
                className="border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-medium bg-white"
              >
                <option value="release">並び順: 発売日順</option>
                <option value="name">並び順: 名前順</option>
                <option value="civilization">並び順: 文明順</option>
                <option value="cost">並び順: コスト順</option>
                <option value="rarity">並び順: レアリティ順</option>
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

            <div className={`${activeTab === 'deck' ? 'order-1 lg:order-2 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1.5 lg:pb-6' : ''} space-y-3`}>
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

                <div className={`grid gap-2 sm:gap-3 ${activeTab === 'deck' ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-5'}`}>
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
                                disabled={(deckCardNameCounts[normalizeDeckCardName(card.name)] || 0) >= 4 || totalDeckCardCount >= MAX_DECK_LIMIT}
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
            </div>
          </section>

          {activeTab === 'deck' && (
            <aside className="order-1 lg:order-2 lg:col-span-6 lg:h-full lg:min-h-0">
              <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-4 flex flex-col lg:h-full overflow-hidden">
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
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
                        title="スクショ"
                        aria-label="スクショ"
                        className="relative group p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                      >
                        {isExportingImage ? <Loader2 className="h-4 w-4 animate-spin text-indigo-600" /> : <Camera className="h-4 w-4" />}
                        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 shadow transition-opacity group-hover:opacity-100 z-20">
                          スクショ
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={totalDeckCardCount === 0}
                        onClick={handleCopyDeckRecipe}
                        title="レシピコピー"
                        aria-label="レシピコピー"
                        className="relative group p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                      >
                        {copiedDeckList ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
                        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 shadow transition-opacity group-hover:opacity-100 z-20">
                          レシピコピー
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeckViewMode(deckViewMode === 'tiles' ? 'list' : 'tiles')}
                        title={deckViewMode === 'tiles' ? 'リスト表示へ切替' : 'タイル表示へ切替'}
                        aria-label={deckViewMode === 'tiles' ? 'リスト表示へ切替' : 'タイル表示へ切替'}
                        className="relative group p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                      >
                        {deckViewMode === 'tiles' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
                        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 shadow transition-opacity group-hover:opacity-100 z-20">
                          {deckViewMode === 'tiles' ? 'リスト表示' : 'タイル表示'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={clearDeck}
                        title="削除"
                        aria-label="削除"
                        className="relative group p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-white opacity-0 shadow transition-opacity group-hover:opacity-100 z-20">
                          削除
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-500">メインデッキ:</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${mainDeckCount >= BASE_DECK_LIMIT ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {mainDeckCount >= BASE_DECK_LIMIT ? `${mainDeckCount}枚 構築完了` : `${mainDeckCount}枚 / 一時保存可`}
                      </span>
                    </div>
                    <span className={`font-black text-xs ${mainDeckCount >= BASE_DECK_LIMIT ? 'text-emerald-600 flex items-center gap-1' : 'text-blue-600'}`}>
                      {mainDeckCount} / {MAX_DECK_LIMIT}枚
                      {mainDeckCount >= BASE_DECK_LIMIT && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${mainDeckCount >= BASE_DECK_LIMIT ? 'bg-emerald-500' : 'bg-blue-600'}`}
                      style={{ width: `${Math.min(100, (mainDeckCount / MAX_DECK_LIMIT) * 100)}%` }}
                    />
                  </div>

                  <div className="pt-1 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                      <span>ゾーン選択（1つ選択・選択ゾーンのカードのみ表示）</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDeckZoneFilter('main');
                          setCurrentPage(1);
                        }}
                        className={`p-1.5 rounded-xl border text-left transition cursor-pointer ${
                          selectedDeckZoneFilter === 'main'
                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300'
                        }`}
                      >
                        <div className="text-[10px] font-black leading-tight">🃏 メイン</div>
                        <div className={`text-[9px] font-bold mt-0.5 ${selectedDeckZoneFilter === 'main' ? 'text-blue-100' : 'text-slate-500'}`}>
                          {mainDeckCount} / {MAX_DECK_LIMIT}枚
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDeckZoneFilter('hyperspatial');
                          setCurrentPage(1);
                        }}
                        className={`p-1.5 rounded-xl border text-left transition cursor-pointer ${
                          selectedDeckZoneFilter === 'hyperspatial'
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300'
                        }`}
                      >
                        <div className="text-[10px] font-black leading-tight">🌌 超次元</div>
                        <div className={`text-[9px] font-bold mt-0.5 ${selectedDeckZoneFilter === 'hyperspatial' ? 'text-indigo-100' : 'text-slate-500'}`}>
                          {hyperspatialCount} / {MAX_HYPERSPATIAL_LIMIT}枚
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDeckZoneFilter('gr');
                          setCurrentPage(1);
                        }}
                        className={`p-1.5 rounded-xl border text-left transition cursor-pointer ${
                          selectedDeckZoneFilter === 'gr'
                            ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-amber-300'
                        }`}
                      >
                        <div className="text-[10px] font-black leading-tight">🎲 GRゾーン</div>
                        <div className={`text-[9px] font-bold mt-0.5 ${selectedDeckZoneFilter === 'gr' ? 'text-amber-100' : 'text-slate-500'}`}>
                          {grCount} / {MAX_GR_LIMIT}枚(同名2)
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDeckZoneFilter('special');
                          setCurrentPage(1);
                        }}
                        className={`p-1.5 rounded-xl border text-left transition cursor-pointer ${
                          selectedDeckZoneFilter === 'special'
                            ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-rose-300'
                        }`}
                      >
                        <div className="text-[10px] font-black leading-tight">🔥 禁断/零龍</div>
                        <div className={`text-[9px] font-bold mt-0.5 ${selectedDeckZoneFilter === 'special' ? 'text-rose-100' : 'text-slate-500'}`}>
                          {specialZoneCount > 0 ? `${specialZoneCount}枚(セット済)` : '最大1セット'}
                        </div>
                      </button>
                    </div>
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
                  {deckViewMode === 'tiles' ? (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
                      {selectedDeckZoneFilter === 'main' && (
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 mb-1 flex items-center justify-between">
                          <span>メインデッキ（40〜60枚・同名4枚まで / クリックで削除）</span>
                          <span>{flattenedDeckCards.length} / {MAX_DECK_LIMIT}枚</span>
                        </div>

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
                      )}

                      {/* 超次元ゾーン（最大8枚） */}
                      {selectedDeckZoneFilter === 'hyperspatial' && (
                        <div className="p-1.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80">
                          <div className="flex items-center justify-between text-[10px] font-extrabold text-indigo-700 mb-1">
                            <span>🌌 超次元ゾーン（サイキック／ドラグハート）</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDeckZoneFilter('hyperspatial');
                                  setCurrentPage(1);
                                }}
                                className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[9px] font-bold hover:bg-indigo-700 cursor-pointer"
                              >
                                カード検索
                              </button>
                              <span>{deckCardsByZone.hyperspatial.length} / {MAX_HYPERSPATIAL_LIMIT}枚</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-8 gap-1">
                            {deckCardsByZone.hyperspatial.map((card, idx) => (
                              <div
                                key={`hs-${card.id}-${idx}`}
                                onClick={() => removeCardFromDeck(card.id)}
                                title={`${card.name}（クリックで1枚減らす）`}
                                className="group relative aspect-[3/4] rounded overflow-hidden border border-indigo-300 bg-white cursor-pointer hover:border-red-400"
                              >
                                {card.image_url ? (
                                  <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-[6px] text-slate-400 flex items-center justify-center h-full">No Img</div>
                                )}
                                <div className="absolute inset-0 bg-red-600/75 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold text-xs">
                                  <Minus className="h-3 w-3" />
                                </div>
                              </div>
                            ))}
                            {deckCardsByZone.hyperspatial.length < MAX_HYPERSPATIAL_LIMIT &&
                              Array.from({ length: MAX_HYPERSPATIAL_LIMIT - deckCardsByZone.hyperspatial.length }).map((_, emptyIdx) => (
                                <div key={`hs-empty-${emptyIdx}`} className="aspect-[3/4] rounded border border-dashed border-indigo-200 bg-white/60 flex items-center justify-center text-indigo-300 text-[8px] select-none">
                                  +
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* GRゾーン（最大12枚・同名2枚まで） */}
                      {selectedDeckZoneFilter === 'gr' && (
                        <div className="p-1.5 rounded-xl bg-amber-50/70 border border-amber-200/80">
                          <div className="flex items-center justify-between text-[10px] font-extrabold text-amber-800 mb-1">
                            <span>🎲 GRゾーン（同名2枚まで）</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDeckZoneFilter('gr');
                                  setCurrentPage(1);
                                }}
                                className="px-1.5 py-0.5 rounded bg-amber-600 text-white text-[9px] font-bold hover:bg-amber-700 cursor-pointer"
                              >
                                カード検索
                              </button>
                              <span>{deckCardsByZone.gr.length} / {MAX_GR_LIMIT}枚</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-6 gap-1">
                            {deckCardsByZone.gr.map((card, idx) => (
                              <div
                                key={`gr-${card.id}-${idx}`}
                                onClick={() => removeCardFromDeck(card.id)}
                                title={`${card.name}（クリックで1枚減らす）`}
                                className="group relative aspect-[3/4] rounded overflow-hidden border border-amber-300 bg-white cursor-pointer hover:border-red-400"
                              >
                                {card.image_url ? (
                                  <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-[6px] text-slate-400 flex items-center justify-center h-full">No Img</div>
                                )}
                                <div className="absolute inset-0 bg-red-600/75 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold text-xs">
                                  <Minus className="h-3 w-3" />
                                </div>
                              </div>
                            ))}
                            {deckCardsByZone.gr.length < MAX_GR_LIMIT &&
                              Array.from({ length: MAX_GR_LIMIT - deckCardsByZone.gr.length }).map((_, emptyIdx) => (
                                <div key={`gr-empty-${emptyIdx}`} className="aspect-[3/4] rounded border border-dashed border-amber-200 bg-white/60 flex items-center justify-center text-amber-300 text-[8px] select-none">
                                  +
                                </div>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* 禁断 / ドルマゲドン / ゼーロン専用ゾーン（最大1セット） */}
                      {selectedDeckZoneFilter === 'special' && (
                        <div className="p-1.5 rounded-xl bg-rose-50/70 border border-rose-200/80">
                          <div className="flex items-center justify-between text-[10px] font-extrabold text-rose-700 mb-1">
                            <span>🔥 禁断 / ドルマゲドン / ゼーロン（最大1セット）</span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDeckZoneFilter('special');
                                  setCurrentPage(1);
                                }}
                                className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-bold hover:bg-rose-700 cursor-pointer"
                              >
                                カード検索
                              </button>
                              <span>{deckCardsByZone.special.length > 0 ? `${deckCardsByZone.special.length}枚` : '0 / 1セット'}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-5 gap-1">
                            {deckCardsByZone.special.map((card, idx) => (
                              <div
                                key={`sp-${card.id}-${idx}`}
                                onClick={() => removeCardFromDeck(card.id)}
                                title={`${card.name}（クリックで1枚減らす）`}
                                className="group relative aspect-[3/4] rounded overflow-hidden border border-rose-300 bg-white cursor-pointer hover:border-red-400"
                              >
                                {card.image_url ? (
                                  <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="text-[6px] text-slate-400 flex items-center justify-center h-full">No Img</div>
                                )}
                                <div className="absolute inset-0 bg-red-600/75 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white font-bold text-xs">
                                  <Minus className="h-3 w-3" />
                                </div>
                              </div>
                            ))}
                            {deckCardsByZone.special.length === 0 && (
                              <div className="col-span-5 py-3 rounded border border-dashed border-rose-200 bg-white/60 text-center text-[10px] font-bold text-rose-400 select-none">
                                禁断・ドルマゲドンX・零龍（ゼーロン）を1セット設定可能
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {(
                        [
                          { key: 'main', label: `メインデッキ (${mainDeckCount}/${MAX_DECK_LIMIT}枚)`, badge: 'text-slate-600' },
                          { key: 'hyperspatial', label: `🌌 超次元ゾーン (${hyperspatialCount}/${MAX_HYPERSPATIAL_LIMIT}枚)`, badge: 'text-indigo-700' },
                          { key: 'gr', label: `🎲 GRゾーン (${grCount}/${MAX_GR_LIMIT}枚・同名2枚まで)`, badge: 'text-amber-700' },
                          { key: 'special', label: `🔥 禁断 / ドルマゲドン / ゼーロン (${specialZoneCount}枚)`, badge: 'text-rose-700' },
                        ] as const
                      ).map((sec) => {
                        if (sec.key !== selectedDeckZoneFilter) return null;
                        const entries = Object.entries(deckCards).filter(([cardId]) => {
                          const found = cards.find((c) => c.id === cardId);
                          return found && getCardDeckZone(found) === sec.key;
                        });
                        if (entries.length === 0) {
                          return (
                            <div key={sec.key} className="text-center py-8 text-xs text-slate-400 font-medium border-2 border-dashed border-slate-100 rounded-2xl">
                              {sec.label} にまだカードがありません。左の一覧から追加してください。
                            </div>
                          );
                        }
                        return (
                          <div key={sec.key} className="space-y-1">
                            <div className={`text-[10px] font-extrabold px-1 ${sec.badge}`}>{sec.label}</div>
                            {entries.map(([cardId, count]) => {
                              const card = cards.find((c) => c.id === cardId);
                              if (!card) return null;
                              const owned = counts[card.id] || 0;
                              const isShort = count > owned;
                              const nameCount = deckCardNameCounts[normalizeDeckCardName(card.name)] || 0;
                              const disablePlus =
                                sec.key === 'hyperspatial'
                                  ? nameCount >= 4 || hyperspatialCount >= MAX_HYPERSPATIAL_LIMIT
                                  : sec.key === 'gr'
                                  ? nameCount >= 2 || grCount >= MAX_GR_LIMIT
                                  : sec.key === 'special'
                                  ? nameCount >= 1
                                  : nameCount >= 4 || mainDeckCount >= MAX_DECK_LIMIT;

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
                                    <button type="button" onClick={() => addCardToDeck(card)} disabled={disablePlus} className="h-4 w-4 flex items-center justify-center hover:bg-slate-100 rounded text-slate-600 disabled:opacity-30">
                                      <Plus className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                </div>

                <div className="shrink-0 pt-2.5 mt-2 border-t border-slate-100 bg-white">
                  <button
                    type="button"
                    onClick={openThumbnailPickerBeforeSave}
                    disabled={deckSaving || totalDeckCardCount === 0}
                    className={`w-full py-2.5 text-white font-bold rounded-2xl text-xs transition shadow-md flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer ${
                      mainDeckCount >= BASE_DECK_LIMIT ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {deckSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {currentDeckId
                      ? `保存する（メイン${mainDeckCount}枚${totalDeckCardCount > mainDeckCount ? `＋外部${totalDeckCardCount - mainDeckCount}枚` : ''}）`
                      : mainDeckCount >= BASE_DECK_LIMIT
                      ? `デッキを新規保存する（メイン${mainDeckCount}枚 構築完了）`
                      : `下書き保存する（メイン${mainDeckCount}/${MAX_DECK_LIMIT}枚）`}
                  </button>
                </div>
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