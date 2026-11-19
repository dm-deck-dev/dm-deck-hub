export interface Card {
  id: string;
  name: string;
  ruby?: string | null;
  card_type: string;
  civilization: string[];
  cost: number | null;
  power: number | null;
  race: string[];
  rarity: string | null;
  effect: string | null;
  set_name: string | null;
  image_url: string | null;
}

export interface DeckCardItem {
  card: Card;
  count: number;
}

export interface Deck {
  id: string;
  name: string;
  cards: Record<string, number>; // cardId -> count
}