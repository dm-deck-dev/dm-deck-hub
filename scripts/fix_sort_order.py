import os
import time
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

def main():
    load_env(".env.local")
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        print("エラー: .env.local の設定が見つかりません。")
        return

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }

    print("既存DBのカード一覧（画像ファイル名 -> ID）を読み込み中...")
    img_to_ids = {}
    offset = 0
    while True:
        res = requests.get(
            f"{supabase_url}/rest/v1/cards?select=id,image_url&limit=1000&offset={offset}",
            headers=headers,
            timeout=30,
        )
        res.raise_for_status()
        rows = res.json()
        if not rows:
            break
        for r in rows:
            img_url = r.get("image_url") or ""
            if img_url:
                bn = os.path.basename(img_url).lower()
                img_to_ids.setdefault(bn, []).append(r["id"])
        offset += 1000

    print("公式サイトの一覧（新着順）をスキャンして並び順を再計算します...")
    # 1ページ目の1番目が最大値になるように大きな基準値から1ずつ減算
    base_sort_order = int(time.time() * 1000) + 1_000_000
    global_pos = 0
    assigned_ids = set()
    updates = []
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
            print(f"ページ {page} 取得エラー（リトライ）: {e}")
            time.sleep(2)
            continue

        soup = BeautifulSoup(res.text, "html.parser")
        img_tags = soup.select("img.cardImage")
        if not img_tags:
            print(f"ページ {page} で最終ページに到達しました。")
            break

        for img in img_tags:
            src = img.get("src") or ""
            if not src:
                continue
            bn = os.path.basename(src).lower()
            for cid in img_to_ids.get(bn, []):
                if cid not in assigned_ids:
                    assigned_ids.add(cid)
                    global_pos += 1
                    updates.append((cid, base_sort_order - global_pos))

        if page % 50 == 0:
            print(f"  スキャン進捗: ページ {page} 完了（整列済み: {len(updates)} 件）")

        page += 1
        time.sleep(0.15)

    print(f"\nSupabaseの sort_order を {len(updates)} 件一括更新中...")
    for idx, (cid, sort_val) in enumerate(updates, 1):
        r = requests.patch(
            f"{supabase_url}/rest/v1/cards?id=eq.{cid}",
            json={"sort_order": sort_val},
            headers=headers,
            timeout=15,
        )
        if not r.ok:
            print(f"更新エラー ({cid}): {r.status_code}")
        if idx % 1000 == 0:
            print(f"  DB反映進捗: {idx} / {len(updates)} 件完了")

    print(f"\n=== 並び順の修正が完了しました！（全 {len(updates)} 件を公式サイトの新着順に整列） ===")

if __name__ == "__main__":
    main()
