import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_RETURN_POINTS,
  DEFAULT_STARTING_POINTS,
  M_LEAGUE_RANK_POINTS,
  type CalculatedScore,
} from "@/lib/score";

export type ScorePlayerResolution = {
  id: string;
  userId: string | null;
  isGuest: boolean;
};

type SaveGameInput = {
  supabase: SupabaseClient;
  userId: string;
  groupId: string;
  playedOn: string;
  gameNumber: number;
  scores: CalculatedScore[];
  resolvedPlayers: Map<string, ScorePlayerResolution>;
};

export async function saveGameWithResults({
  supabase,
  userId,
  groupId,
  playedOn,
  gameNumber,
  scores,
  resolvedPlayers,
}: SaveGameInput) {
  const { data: game, error: gameError } = await supabase
    .from("games")
    .insert({
      user_id: userId,
      group_id: groupId,
      played_on: playedOn,
      game_number: gameNumber,
      starting_points: DEFAULT_STARTING_POINTS,
      return_points: DEFAULT_RETURN_POINTS,
      rank_points: [...M_LEAGUE_RANK_POINTS],
    })
    .select("id")
    .single();

  if (gameError) throw new Error(`保存に失敗しました: ${gameError.message}`);

  const resultRows = scores.map((score) => {
    const resolvedPlayer = resolvedPlayers.get(score.name.trim());

    return {
      game_id: game.id,
      player_name: score.name,
      player_user_id: resolvedPlayer?.userId ?? null,
      guest_player_id: resolvedPlayer?.isGuest ? resolvedPlayer.id : null,
      final_points: score.finalPoints,
      is_starting_dealer: score.isStartingDealer,
      starting_wind: score.startWind,
      rank: score.rank,
      point_diff_score: score.pointDiffScore,
      rank_point: score.rankPoint,
      oka: score.oka,
      total_score: score.totalScore,
    };
  });

  const { error: resultsError } = await supabase.from("game_results").insert(resultRows);

  if (resultsError) throw new Error(`結果の保存に失敗しました: ${resultsError.message}`);

  return game.id as string;
}
