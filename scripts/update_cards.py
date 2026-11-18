import os
import re
import time
import hashlib
import requests
from bs4 import BeautifulSoup

# =========================================================
# 設定：取得したいページ範囲
# ・最新弾（1〜5ページ目）を更新したい場合：START_PAGE = 1, END_PAGE = 5
# ・全カードの順番を公式サイトと完全に揃えたい場合：START_PAGE = 1, END_PAGE = 2000
# =========================================================
import sys
START_PAGE = int(sys.argv[1]) if len(sys.argv) > 1 else 1
END_PAGE = int(sys.argv[2]) if len(sys.argv) > 2 else START_PAGE if len(sys.argv) > 1 else 5

ENDPOINT_URL = "https://dm.takaratomy.co.jp/card/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
}

def load_env(filepath=".env.local"):
    if not os.path.exists(filepath):
        return
    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

def generate_card_id(key_str: str) -> str:
    digest = hashlib.md5(key_str.encode("utf-8")).hexdigest()[:8].upper()
    return f"DM-{digest}"

def get_text_safe(soup: BeautifulSoup, selector: str) -> str:
    elem = soup.select_one(selector)
    return elem.get_text(strip=True) if elem else ""

def parse_int_or_none(val: str):
    if not val:
        return None
    digits = re.sub(r"[^0-9]", "", val)
    return int(digits) if digits else None

def parse_array(val: str):
    if not val or val == "-":
        return []
    return [p.strip() for p in re.split(r"[/／]", val) if p.strip()]

def fetch_existing_card_map(supabase_url: str, supabase_key: str) -> dict:
    """既存DBから (name, set_name, image_url) -> id の対応表を取得して重複を防ぐ"""
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    existing_map = {}
    offset = 0
    while True:
        res = requests.get(
            f"{supabase_url}/rest/v1/cards?select=id,name,set_name,image_url&limit=1000&offset={offset}",
            headers=headers,
            timeout=30,
        )
        res.raise_for_status()
        rows = res.json()
        if not rows:
            break
        for r in rows:
            sig = (r.get("name") or "", r.get("set_name") or "", r.get("image_url") or "")
            existing_map[sig] = r["id"]
        offset += 1000
    return existing_map

def upsert_to_supabase(supabase_url: str, supabase_key: str, records: list):
    if not records:
        return
    url = f"{supabase_url}/rest/v1/cards?on_conflict=id"
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    res = requests.post(url, json=records, headers=headers, timeout=30)
    if not res.ok:
        raise RuntimeError(f"Supabase保存エラー ({res.status_code}): {res.text}")

def main():
    load_env(".env.local")
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        print("エラー: .env.local に NEXT_PUBLIC_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません。")
        return

    print("既存データベースのカード一覧を照合用に読み込み中...")
    existing_map = fetch_existing_card_map(supabase_url, supabase_key)
    print(f"既存カード {len(existing_map)} 件のインデックスを作成しました。")

    print(f"\n=== デュエマ公式カードデータのスクレイピング＆Supabase更新開始（ページ {START_PAGE} 〜 {END_PAGE}） ===")
    # ミリ秒単位の基準値から公式サイトの登場順（global_pos）を引くことで完全一致の降順を作る
    base_sort_order = int(time.time() * 1000)
    global_pos = 0
    total_saved = 0

    for current_page in range(START_PAGE, END_PAGE + 1):
        print(f"\n--- 【 ページ {current_page} / {END_PAGE} 】 リスト取得中... ---")

        payload = {
            "pagenum": str(current_page),
            "suggest": "on",
            "keyword_type[]": ["card_name", "card_ruby", "card_text"],
            "samename": "show",
            "sort": "release_new",
        }

        try:
            res = requests.post(ENDPOINT_URL, data=payload, headers=HEADERS, timeout=15)
            res.raise_for_status()
        except Exception as e:
            print(f"ページ {current_page} の取得に失敗しました: {e}")
            continue

        soup = BeautifulSoup(res.text, "html.parser")
        img_tags = soup.select("img.cardImage")

        if not img_tags:
            print(f"ページ {current_page} にカードが見つかりませんでした。終了します。")
            break

        card_links = list(dict.fromkeys(
            img.get("data-href") for img in img_tags if img.get("data-href")
        ))

        print(f"ページ {current_page}: {len(card_links)} 件のカードを検出。詳細を取得します...")
        page_records = {}

        for idx, link in enumerate(card_links, 1):
            detail_url = "https://dm.takaratomy.co.jp" + link if link.startswith("/") else link

            try:
                detail_res = requests.get(detail_url, headers=HEADERS, timeout=10)
                detail_res.raise_for_status()
                detail_soup = BeautifulSoup(detail_res.text, "html.parser")

                img_elem = detail_soup.select_one(".card-img img, .detail-img img, img.cardImage")
                img_url = ""
                if img_elem and img_elem.get("src"):
                    src = img_elem.get("src")
                    img_url = "https://dm.takaratomy.co.jp" + src if src.startswith("/") else src

                name = get_text_safe(detail_soup, "h3.card-name, h1.card-name, h3")
                name = re.sub(r"[\(（][^\)）]*[\)）]$", "", name).strip()
                if not name:
                    continue

                card_type = get_text_safe(detail_soup, "td.type")
                civil_raw = get_text_safe(detail_soup, "td.civil")
                rarity = get_text_safe(detail_soup, "td.rarelity")
                power_raw = get_text_safe(detail_soup, "td.power")
                cost_raw = get_text_safe(detail_soup, "td.cost")
                race_raw = get_text_safe(detail_soup, "td.race")
                pack_name = get_text_safe(detail_soup, "span.packname")

                skills_elem = detail_soup.select_one("td.skills.full, td.skills")
                skills = ""
                if skills_elem:
                    li_items = skills_elem.select("li")
                    skills = "\n".join(li.get_text(strip=True) for li in li_items) if li_items else skills_elem.get_text(strip=True)

                sig = (name, pack_name, img_url)
                if sig in existing_map:
                    card_id = existing_map[sig]
                    status_label = "更新"
                else:
                    unique_key = f"{name}_{pack_name}_{img_url}" if img_url else f"{name}_{pack_name}_{link}"
                    card_id = generate_card_id(unique_key)
                    existing_map[sig] = card_id
                    status_label = "新規"

                global_pos += 1
                sort_val = base_sort_order - global_pos

                # 同一ページ内に同じカードが複数回出た場合は、先に出現した順番（大きいsort_val）を優先保持
                if card_id not in page_records:
                    page_records[card_id] = {
                        "id": card_id,
                        "name": name,
                        "card_type": card_type,
                        "civilization": parse_array(civil_raw),
                        "cost": parse_int_or_none(cost_raw),
                        "power": parse_int_or_none(power_raw),
                        "race": parse_array(race_raw),
                        "rarity": rarity,
                        "effect": skills,
                        "set_name": pack_name,
                        "image_url": img_url,
                        "sort_order": sort_val,
                    }
                print(f"  [{idx}/{len(card_links)}] #{global_pos} {status_label}: {name} ({card_id})")
                time.sleep(0.25)

            except Exception as e:
                print(f"  詳細取得失敗 ({detail_url}): {e}")

        records_list = list(page_records.values())
        if records_list:
            upsert_to_supabase(supabase_url, supabase_key, records_list)
            total_saved += len(records_list)
            print(f"★ ページ {current_page} の {len(records_list)} 件をSupabaseへ保存・更新しました（累計: {total_saved} 件）")

    print(f"\n=== すべての処理が完了しました（合計 {total_saved} 件処理・重複なし） ===")

if __name__ == "__main__":
    main()
