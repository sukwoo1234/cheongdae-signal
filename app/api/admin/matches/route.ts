import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";

type MatchRow = {
  id: string;
  viewer_user_id: string;
  viewed_card_id: string;
  bonus: boolean;
  selection_number: number;
  created_at: string;
};

type CardRow = { id: string; user_id: string; one_liner: string };
type UserRow = { id: string; email: string; gender: string | null };

export async function GET() {
  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const admin = createAdminClient();
  const [{ data: matches, error: matchError }, { data: cards, error: cardError }] = await Promise.all([
    admin
      .from("matches")
      .select("id, viewer_user_id, viewed_card_id, bonus, selection_number, created_at")
      .order("created_at", { ascending: false }),
    admin.from("cards").select("id, user_id, one_liner"),
  ]);

  if (matchError || cardError) {
    return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });
  }

  const matchRows = (matches ?? []) as MatchRow[];
  const cardRows = (cards ?? []) as CardRow[];
  if (matchRows.length === 0) {
    return NextResponse.json(
      { selections: [], mutual_pairs: [], total_selections: 0, mutual_count: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const cardById = new Map(cardRows.map((card) => [card.id, card]));
  const cardByOwner = new Map(cardRows.map((card) => [card.user_id, card]));
  const userIds = new Set<string>();
  for (const match of matchRows) {
    userIds.add(match.viewer_user_id);
    const target = cardById.get(match.viewed_card_id);
    if (target) userIds.add(target.user_id);
  }

  const { data: users, error: userError } = await admin
    .from("users")
    .select("id, email, gender")
    .in("id", Array.from(userIds));
  if (userError) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  const userById = new Map(((users ?? []) as UserRow[]).map((entry) => [entry.id, entry]));
  const directionMap = new Map<string, MatchRow>();
  for (const match of matchRows) {
    const target = cardById.get(match.viewed_card_id);
    if (target) directionMap.set(`${match.viewer_user_id}->${target.user_id}`, match);
  }

  const selections = matchRows.flatMap((match) => {
    const targetCard = cardById.get(match.viewed_card_id);
    const viewer = userById.get(match.viewer_user_id);
    const target = targetCard ? userById.get(targetCard.user_id) : null;
    if (!targetCard || !viewer || !target) return [];
    return [{
      id: match.id,
      viewer: { id: viewer.id, email: viewer.email, gender: viewer.gender },
      target: {
        id: target.id,
        email: target.email,
        gender: target.gender,
        one_liner: targetCard.one_liner,
      },
      selection_number: match.selection_number,
      bonus: match.bonus,
      created_at: match.created_at,
      mutual: directionMap.has(`${target.id}->${viewer.id}`),
    }];
  });

  const pairKeys = new Set<string>();
  const mutualPairs = [];
  for (const selection of selections) {
    if (!selection.mutual) continue;
    const ids = [selection.viewer.id, selection.target.id].sort();
    const pairKey = `${ids[0]}:${ids[1]}`;
    if (pairKeys.has(pairKey)) continue;
    pairKeys.add(pairKey);

    const a = userById.get(ids[0]);
    const b = userById.get(ids[1]);
    const aToB = directionMap.get(`${ids[0]}->${ids[1]}`);
    const bToA = directionMap.get(`${ids[1]}->${ids[0]}`);
    if (!a || !b || !aToB || !bToA) continue;

    mutualPairs.push({
      pair_key: pairKey,
      first: {
        id: a.id,
        email: a.email,
        gender: a.gender,
        one_liner: cardByOwner.get(a.id)?.one_liner ?? "삭제된 카드",
        selection_number: aToB.selection_number,
        bonus: aToB.bonus,
        selected_at: aToB.created_at,
      },
      second: {
        id: b.id,
        email: b.email,
        gender: b.gender,
        one_liner: cardByOwner.get(b.id)?.one_liner ?? "삭제된 카드",
        selection_number: bToA.selection_number,
        bonus: bToA.bonus,
        selected_at: bToA.created_at,
      },
      matched_at: new Date(Math.max(
        new Date(aToB.created_at).getTime(),
        new Date(bToA.created_at).getTime(),
      )).toISOString(),
    });
  }

  mutualPairs.sort((a, b) => new Date(b.matched_at).getTime() - new Date(a.matched_at).getTime());

  return NextResponse.json(
    {
      selections,
      mutual_pairs: mutualPairs,
      total_selections: selections.length,
      mutual_count: mutualPairs.length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
