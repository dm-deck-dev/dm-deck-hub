import io
import os
import re
import time
import requests
from bs4 import BeautifulSoup
from openpyxl import Workbook
from openpyxl.drawing.image import Image as OpenpyxlImage

# =========================================================
# 設定：取得したいページ範囲（まずはテストで1ページ目のみ）
# =========================================================
START_PAGE = 1
END_PAGE = 100

ENDPOINT_URL = "https://dm.takaratomy.co.jp/card/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
}

def main():
    card_data_list = []
    print("=== デュエマ公式カードデータのスクレイピング開始 ===")

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

        for idx, link in enumerate(card_links, 1):
            detail_url = "https://dm.takaratomy.co.jp" + link if link.startswith("/") else link

            try:
                detail_res = requests.get(detail_url, headers=HEADERS, timeout=10)
                detail_soup = BeautifulSoup(detail_res.text, "html.parser")

                # 画像URL
                img_elem = detail_soup.select_one(".card-img img, .detail-img img, img.cardImage")
                img_url = ""
                if img_elem and img_elem.get("src"):
                    src = img_elem.get("src")
                    img_url = "https://dm.takaratomy.co.jp" + src if src.startswith("/") else src

                # カード名（末尾の収録弾括弧を削除）
                name_elem = detail_soup.select_one("h3.card-name, h1.card-name, h3")
                name = name_elem.get_text(strip=True) if name_elem else ""
                if name:
                    name = re.sub(r"[\(（][^\)）]*[\)）]$", "", name).strip()

                # 各ステータス
                card_type = (detail_soup.select_one("td.type") or "").get_text(strip=True) if detail_soup.select_one("td.type") else ""
                civilization = (detail_soup.select_one("td.civil") or "").get_text(strip=True) if detail_soup.select_one("td.civil") else ""
                rarity = (detail_soup.select_one("td.rarelity") or "").get_text(strip=True) if detail_soup.select_one("td.rarelity") else ""
                power = (detail_soup.select_one("td.power") or "").get_text(strip=True) if detail_soup.select_one("td.power") else ""
                cost = (detail_soup.select_one("td.cost") or "").get_text(strip=True) if detail_soup.select_one("td.cost") else ""
                race = (detail_soup.select_one("td.race") or "").get_text(strip=True) if detail_soup.select_one("td.race") else ""

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

                card_data_list.append({
                    "img_url": img_url,
                    "name": name,
                    "type": card_type,
                    "civil": civilization,
                    "rarity": rarity,
                    "power": power,
                    "cost": cost,
                    "race": race,
                    "skills": skills,
                    "pack": pack_name,
                })
                print(f"  [{idx}/{len(card_links)}] 取得完了: {name}")
                time.sleep(0.3)

            except Exception as e:
                print(f"  詳細取得失敗 ({detail_url}): {e}")

    if not card_data_list:
        print("データが取得できませんでした。")
        return

    # Excelファイルへ出力（同一フォルダ内に duema_cards.xlsx として保存）
    output_file = "duema_cards.xlsx"
    print(f"\nExcelファイル '{output_file}' を作成中...")

    wb = Workbook()
    ws = wb.active
    ws.title = "カード一覧"

    headers = ["画像", "画像URL", "名前", "カードの種類", "文明", "レアリティ", "パワー", "コスト", "種族", "特殊能力", "収録弾"]
    ws.append(headers)

    for row_idx, item in enumerate(card_data_list, start=2):
        ws.append([
            "",
            item["img_url"],
            item["name"],
            item["type"],
            item["civil"],
            item["rarity"],
            item["power"],
            item["cost"],
            item["race"],
            item["skills"],
            item["pack"],
        ])
        ws.row_dimensions[row_idx].height = 95

        if item["img_url"]:
            try:
                img_res = requests.get(item["img_url"], timeout=10)
                if img_res.status_code == 200:
                    img = OpenpyxlImage(io.BytesIO(img_res.content))
                    img.width = 65
                    img.height = 91
                    ws.add_image(img, f"A{row_idx}")
            except Exception:
                pass

    col_widths = {"A": 14, "B": 35, "C": 25, "D": 15, "E": 12, "F": 10, "G": 12, "H": 10, "I": 22, "J": 50, "K": 25}
    for col, width in col_widths.items():
        ws.column_dimensions[col].width = width

    wb.save(output_file)
    print(f"\n★ Excel保存完了: scripts/{output_file} （計 {len(card_data_list)} 件）")

if __name__ == "__main__":
    main()