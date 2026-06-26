export type Seat = "self" | "right" | "top" | "left";

export type PlayerResult = {
  seat: Seat;
  name: string;
  finalPoints: number;
  isStartingDealer: boolean;
};

export type CalculatedScore = PlayerResult & {
  rank: number;
  pointDiffScore: number;
  rankPoint: number;
  oka: number;
  totalScore: number;
};

export const DEFAULT_STARTING_POINTS = 25000;
export const DEFAULT_RETURN_POINTS = 30000;
export const M_LEAGUE_RANK_POINTS = [50, 10, -10, -30] as const;

export const SEAT_LABELS: Record<Seat, string> = {
  self: "自分",
  right: "下家",
  top: "対面",
  left: "上家",
};

export function calculateScores(
  players: PlayerResult[],
  rankPoints: readonly number[] = M_LEAGUE_RANK_POINTS,
  startingPoints = DEFAULT_STARTING_POINTS,
  returnPoints = DEFAULT_RETURN_POINTS,
): CalculatedScore[] {
  const sorted = [...players].sort((a, b) => b.finalPoints - a.finalPoints);
  const oka = ((returnPoints - startingPoints) * players.length) / 1000;

  return sorted.map((player, index) => {
    const rank = index + 1;
    const pointDiffScore = (player.finalPoints - returnPoints) / 1000;
    const rankPoint = rankPoints[index] ?? 0;
    const topOka = index === 0 ? oka : 0;

    return {
      ...player,
      rank,
      pointDiffScore,
      rankPoint,
      oka: topOka,
      totalScore: roundToOneDecimal(pointDiffScore + rankPoint + topOka),
    };
  });
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}
