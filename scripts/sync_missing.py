import os
import re
import time
import hashlib
import requests
from bs4 import BeautifulSoup

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

def fetch_existing_records(supabase_url: str, supabase_key: str):
    headers = {"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
    existing_map = {}
    existing_img_names = set()
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
            img_url = r.get("image_url") or ""
            if img_url:
                # 画像ファイル名（例: dm18-124.jpg）で照合用キーを作成
                existing_img_names.add(os.path.basename(img_url).lower())
        offset += 1000
    return existing_map, existing_img_names

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
        print("エラー: .env.local の設定が見つかりません。")
        return

    print("既存データベースのカード情報を読み込み中...")
    existing_map, existing_img_names = fetch_existing_records(supabase_url, supabase_key)
    print(f"DB登録済みカード数: {len(existing_map)} 件 / 画像ファイル名数: {len(existing_img_names)} 件")

    print("\n=== ステップ1：全一覧ページを高速スキャンして未登録カードを特定します ===")
    missing_links = []
    seen_links = set()
    page = 1

    while True:
        payload = {
            "pagenum": str(page),
            "samename": "show",
            "sort": "release_new",
        }
        try:
            res = requests.post(ENDPOINT_URL, data=payload, headers=HEADERS, timeout=15)
            res.raise_for_status()
        except Exception as e:
            print(f"ページ {page} 取得エラー（リトライします）: {e}")
            time.sleep(2)
            continue

        soup = BeautifulSoup(res.text, "html.parser")
        img_tags = soup.select("img.cardImage")
        if not img_tags:
            print(f"ページ {page} で最終ページに到達しました。")
            break

        page_new_count = 0
        for img in img_tags:
            href = img.get("data-href")
            src = img.get("src") or ""
            if not href or href in seen_links:
                continue
            seen_links.add(href)

            img_basename = os.path.basename(src).lower() if src else ""
            # 一覧の画像ファイル名がDBの既存画像ファイル名に無ければ未登録候補とする
            if not img_basename or img_basename not in existing_img_names:
                missing_links.append((page, href, src))
                page_new_count += 1

        if page % 25 == 0 or page_new_count > 0:
            print(f"  スキャン中: ページ {page} (累計検出リンク: {len(seen_links)} 件 / 未登録候補: {len(missing_links)} 件)")

        page += 1
        time.sleep(0.2)

    print(f"\n=== ステップ2：未登録候補 {len(missing_links)} 件の詳細を取得してDBへ保存します ===")
    if not missing_links:
        print("未登録カードはありませんでした。")
        return

    skipped_logs = []
    saved_count = 0
    batch_records = {}
    base_sort_order = int(time.time() * 1000)

    for idx, (src_page, link, list_src) in enumerate(missing_links, 1):
        detail_url = "https://dm.takaratomy.co.jp" + link if link.startswith("/") else link
        try:
            detail_res = requests.get(detail_url, headers=HEADERS, timeout=15)
            detail_res.raise_for_status()
            detail_soup = BeautifulSoup(detail_res.text, "html.parser")

            img_elem = detail_soup.select_one(".card-img img, .detail-img img, img.cardImage")
            img_url = ""
            if img_elem and img_elem.get("src"):
                s = img_elem.get("src")
                img_url = "https://dm.takaratomy.co.jp" + s if s.startswith("/") else s
            elif list_src:
                img_url = "https://dm.takaratomy.co.jp" + list_src if list_src.startswith("/") else list_src

            # 通常のセレクタで取れない場合も考慮して広めにカード名を探す
            name = get_text_safe(detail_soup, "h3.card-name, h1.card-name, .card-detail h3, h3, h2")
            name = re.sub(r"[\(（][^\)）]*[\)）]$", "", name).strip()

            if not name:
                skipped_logs.append(f"[名前取得不可] page={src_page} url={detail_url}")
                print(f"  [{idx}/{len(missing_links)}] スキップ（名前取得不可）: {detail_url}")
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
                label = "更新"
            else:
                unique_key = f"{name}_{pack_name}_{img_url}_{link}"
                card_id = generate_card_id(unique_key)
                existing_map[sig] = card_id
                label = "新規"

            batch_records[card_id] = {
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
                "sort_order": base_sort_order - (src_page * 100 + idx),
            }
            print(f"  [{idx}/{len(missing_links)}] {label} (P.{src_page}): {name} ({card_id})")

            if len(batch_records) >= 50:
                upsert_to_supabase(supabase_url, supabase_key, list(batch_records.values()))
                saved_count += len(batch_records)
                batch_records.clear()

            time.sleep(0.25)

        except Exception as e:
            skipped_logs.append(f"[通信/解析エラー] page={src_page} url={detail_url} err={e}")
            print(f"  [{idx}/{len(missing_links)}] エラー: {detail_url} -> {e}")

    if batch_records:
        upsert_to_supabase(supabase_url, supabase_key, list(batch_records.values()))
        saved_count += len(batch_records)

    print(f"\n=== 補完処理完了：新規・更新 {saved_count} 件を保存しました ===")
    if skipped_logs:
        with open("scripts/missing_errors.log", "w", encoding="utf-8") as f:
            f.write("\n".join(skipped_logs))
        print(f"スキップされた {len(skipped_logs)} 件の詳細は scripts/missing_errors.log に出力しました。")

if __name__ == "__main__":
    main()
