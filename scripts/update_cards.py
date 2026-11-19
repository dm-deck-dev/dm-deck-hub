import os
import re
import time
import hashlib
import requests
from bs4 import BeautifulSoup

# =========================================================
# 設定：取得したいページ範囲
# ・最新弾のみ更新したい場合：START_PAGE = 1, END_PAGE = 5
# ・全件更新したい場合：START_PAGE = 1, END_PAGE = 2000
# =========================================================
START_PAGE = 1
END_PAGE = 5

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

def parse_int_or_none(val: str):
    if not val:
        return None
    digits = re.sub(r"[^0-9]", "", val)
    return int(digits) if digits else None

def parse_array(val: str):
    if not val or val == "-":
        return []
    parts = [p.strip() for p in re.split(r"[/／]", val) if p.strip()]
    return parts

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
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        print("エラー: .env.local から Supabase の URL またはキーが読み込めませんでした。")
        return

    print("=== デュエマ公式カードデータのスクレイピング＆DB更新開始 ===")
    base_sort_order = int(time.time())
    total_saved = 0

    for current_page in range(START_PAGE, END_PAGE + 1):
        print(f"\n--- 【 ページ {current_page} / {END_PAGE} 】 リスト取得中... ---")

        payload = {
            "pagenum": str(current_page),
            "suggest": "on",
            "keyword_type[]": ["card_name", "card_ruby", "card_text"],
            "culture_cond[]": ["単色", "多色"],
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

        card_links = []
        for img in img_tags:
            href = img.get("data-href")
            if href and href not in card_links:
                card_links.append(href)

        print(f"ページ {current_page}: {len(card_links)} 件のカードを検出。詳細を取得します...")
        page_records = {}

        for idx, link in enumerate(card_links, 1):
            detail_url = "https://dm.takaratomy.co.jp" + link if link.startswith("/") else link

            try:
                detail_res = requests.get(detail_url, headers=HEADERS, timeout=10)
                detail_soup = BeautifulSoup(detail_res.text, "html.parser")

                img_elem = detail_soup.select_one(".card-img img, .detail-img img, img.cardImage")
                img_url = ""
                if img_elem and img_elem.get("src"):
                    src = img_elem.get("src")
                    img_url = "https://dm.takaratomy.co.jp" + src if src.startswith("/") else src

                name_elem = detail_soup.select_one("h3.card-name, h1.card-name, h3")
                raw_name = name_elem.get_text(strip=True) if name_elem else ""
                ruby = ""
                if raw_name:
                    m = re.search(r"[\(（]([^\)）]+)[\)）]$", raw_name)
                    if m:
                        ruby = m.group(1).strip()
                    name = re.sub(r"[\(（][^\)）]*[\)）]$", "", raw_name).strip()
                else:
                    name = "" 

                if not name:
                    continue

                card_type = detail_soup.select_one("td.type").get_text(strip=True) if detail_soup.select_one("td.type") else ""
                civil_raw = detail_soup.select_one("td.civil").get_text(strip=True) if detail_soup.select_one("td.civil") else ""
                rarity = detail_soup.select_one("td.rarelity").get_text(strip=True) if detail_soup.select_one("td.rarelity") else ""
                power_raw = detail_soup.select_one("td.power").get_text(strip=True) if detail_soup.select_one("td.power") else ""
                cost_raw = detail_soup.select_one("td.cost").get_text(strip=True) if detail_soup.select_one("td.cost") else ""
                race_raw = detail_soup.select_one("td.race").get_text(strip=True) if detail_soup.select_one("td.race") else ""

                skills_elem = detail_soup.select_one("td.skills.full, td.skills")
                skills = ""
                if skills_elem:
                    li_items = skills_elem.select("li")
                    if li_items:
                        skills = "\n".join([li.get_text(strip=True) for li in li_items])
                    else:
                        skills = skills_elem.get_text(strip=True)

                pack_elem = detail_soup.select_one("span.packname")
                pack_name = pack_elem.get_text(strip=True) if pack_elem else ""

                unique_key = img_url if img_url else f"{name}_{pack_name}_{link}"
                card_id = generate_card_id(unique_key)

                sort_val = base_sort_order - ((current_page - 1) * 100 + idx)

                page_records[card_id] = {
                    "id": card_id,
                    "name": name,
                    "ruby": ruby,
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
                print(f"  [{idx}/{len(card_links)}] 取得完了: {name} ({card_id})")
                time.sleep(0.25)

            except Exception as e:
                print(f"  詳細取得失敗 ({detail_url}): {e}")

        records_list = list(page_records.values())
        if records_list:
            upsert_to_supabase(supabase_url, supabase_key, records_list)
            total_saved += len(records_list)
            print(f"★ ページ {current_page} の {len(records_list)} 件をSupabaseへ保存・更新しました（累計: {total_saved} 件）")

    print(f"\n=== すべての処理が完了しました（合計 {total_saved} 件更新） ===")

if __name__ == "__main__":
    main()
