import { NextRequest, NextResponse } from 'next/server';

const rubyCache = new Map<string, { files: string[]; ts: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6時間

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawQ = (searchParams.get('q') || '').trim();
  if (!rawQ) {
    return NextResponse.json({ files: [] });
  }

  // ひらがなをカタカナに正規化して公式APIへ問い合わせ
  const kataQ = rawQ.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );

  const cached = rubyCache.get(kataQ);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ files: cached.files });
  }

  try {
    const filesSet = new Set<string>();
    // 最大5ページ（約200件分）のルビ一致カードの画像ファイル名を取得
    for (let page = 1; page <= 5; page++) {
      const form = new URLSearchParams();
      form.append('pagenum', String(page));
      form.append('keyword', kataQ);
      form.append('keyword_type[]', 'card_ruby');
      form.append('culture_cond[]', '単色');
      form.append('culture_cond[]', '多色');
      form.append('samename', 'show');

      const res = await fetch('https://dm.takaratomy.co.jp/card/', {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'X-Requested-With': 'XMLHttpRequest',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
        body: form.toString(),
      });

      if (!res.ok) break;
      const html = await res.text();

      const imgMatches = html.matchAll(/<img[^>]+class=["'][^"']*cardImage[^"']*["'][^>]*>/gi);
      let countOnPage = 0;
      for (const m of imgMatches) {
        countOnPage++;
        const srcM = m[0].match(/src=["']([^"']+)["']/i);
        if (srcM && srcM[1]) {
          const fname = srcM[1].split('/').pop()?.split('?')[0].toLowerCase();
          if (fname) filesSet.add(fname);
        }
      }

      if (countOnPage < 40) break;
    }

    const files = Array.from(filesSet);
    rubyCache.set(kataQ, { files, ts: Date.now() });
    return NextResponse.json({ files });
  } catch {
    return NextResponse.json({ files: [] });
  }
}
