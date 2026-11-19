import { NextRequest, NextResponse } from 'next/server';

const rubyCache = new Map<string, { names: string[]; ts: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6時間

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawQ = (searchParams.get('q') || '').trim();
  if (!rawQ) {
    return NextResponse.json({ names: [] });
  }

  // ひらがなをカタカナに正規化して公式APIへ問い合わせ
  const kataQ = rawQ.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );

  const cached = rubyCache.get(kataQ);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ names: cached.names });
  }

  try {
    const namesSet = new Set<string>();
    // 最大3ページ（約120件分）のルビ一致カード名を取得
    for (let page = 1; page <= 3; page++) {
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

      // imgタグの alt / title やカード名テキストを抽出
      const altMatches = html.matchAll(/<img[^>]+class="[^"]*cardImage[^"]*"[^>]*>/g);
      let countOnPage = 0;
      for (const m of altMatches) {
        countOnPage++;
        const tag = m[0];
        const altM = tag.match(/alt="([^"]+)"/);
        if (altM && altM[1]) {
          const clean = altM[1].replace(/[\(（][^\)）]*[\)）]$/, '').trim();
          if (clean) namesSet.add(clean);
        }
      }

      // pタグやspanタグ内のカード名表記も補完抽出
      const nameMatches = html.matchAll(/<(?:p|span|h3)[^>]*class="[^"]*(?:card-name|name)[^"]*"[^>]*>([^<]+)</g);
      for (const nm of nameMatches) {
        const clean = nm[1].replace(/[\(（][^\)）]*[\)）]$/, '').trim();
        if (clean) namesSet.add(clean);
      }

      if (countOnPage < 40) break;
    }

    const names = Array.from(namesSet);
    rubyCache.set(kataQ, { names, ts: Date.now() });
    return NextResponse.json({ names });
  } catch {
    return NextResponse.json({ names: [] });
  }
}
