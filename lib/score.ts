export type Seat = "self" | "right" | "top" | "left";
export type StartWind = "east" | "south" | "west" | "north";

export type PlayerResult = {
  seat: Seat;
  name: string;
  finalPoints: number;
  isStartingDealer: boolean;
};

export type ScoreSummary = {
  name: string;
  finalPoints: number;
  isStartingDealer: boolean;
  startWind: StartWind;
  rank: number;
  pointDiffScore: number;
  rankPoint: number;
  oka: number;
  totalScore: number;
};

export type CalculatedScore = PlayerResult & ScoreSummary;

export const DEFAULT_STARTING_POINTS = 25000;
export const DEFAULT_RETURN_POINTS = 30000;
export const M_LEAGUE_RANK_POINTS = [50, 10, -10, -30] as const;
export const SEAT_ORDER: Seat[] = ["self", "right", "top", "left"];

export const SEAT_LABELS: Record<Seat, string> = {
  self: "自分",
  right: "下家",
  top: "対面",
  left: "上家",
};

export const START_WIND_LABELS: Record<StartWind, string> = {
  east: "東家",
  south: "南家",
  west: "西家",
  north: "北家",
};

const START_WINDS: StartWind[] = ["east", "south", "west", "north"];

export function assignStartWinds(players: PlayerResult[]): (PlayerResult & { startWind: StartWind })[] {
  const startingDealerIndex = SEAT_ORDER.findIndex((seat) =>
    players.some((player) => player.seat === seat && player.isStartingDealer),
  );
  const eastIndex = startingDealerIndex >= 0 ? startingDealerIndex : 0;

  return players.map((player) => {
    const seatIndex = SEAT_ORDER.indexOf(player.seat);
    const windIndex = seatIndex >= 0 ? (seatIndex - eastIndex + SEAT_ORDER.length) % SEAT_ORDER.length : 0;

    return {
      ...player,
      startWind: START_WINDS[windIndex],
    };
  });
}

export function calculateScores(
  players: PlayerResult[],
  rankPoints: readonly number[] = M_LEAGUE_RANK_POINTS,
  startingPoints = DEFAULT_STARTING_POINTS,
  returnPoints = DEFAULT_RETURN_POINTS,
): CalculatedScore[] {
  const playersWithStartWinds = assignStartWinds(players);
  const sorted = [...playersWithStartWinds].sort((a, b) => b.finalPoints - a.finalPoints);
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
