import { NextRequest, NextResponse } from "next/server";

// 動作確認用の全1,250件のモックデータを生成（実際のDBや外部APIに差し替え可能）
const TOTAL_MOCK_CARDS = 1250;
const MOCK_CARDS = Array.from({ length: TOTAL_MOCK_CARDS }, (_, i) => {
  const id = i + 1;
  const categories = ["モンスター", "魔法", "罠", "装備", "サポート"];
  return {
    id,
    name: `カード No.${String(id).padStart(4, "0")}`,
    category: categories[i % categories.length],
    description: `これはカード No.${id} の効果説明テキストです。`,
    imageUrl: "", // 画像URLがある場合はここに入ります
  };
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const limit = Math.max(1, Number(searchParams.get("limit") || "200"));

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const items = MOCK_CARDS.slice(startIndex, endIndex);

  return NextResponse.json({
    items,
    total: MOCK_CARDS.length,
    page,
    limit,
  });
}