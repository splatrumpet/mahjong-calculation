import {
  SEAT_LABELS,
  START_WIND_LABELS,
  type CalculatedScore,
  type ScoreSummary,
} from "@/lib/score";

const scoreSign = (value: number) => (value > 0 ? "+" : "");

function hasSeat(score: ScoreSummary | CalculatedScore): score is CalculatedScore {
  return "seat" in score;
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ScoreTable({ scores, compact = false }: { scores: Array<ScoreSummary | CalculatedScore>; compact?: boolean }) {
  const showSeat = scores.some(hasSeat);

  return (
    <div className="table-wrap">
      <table className={compact ? "compact" : ""}>
        <thead>
          <tr>
            <th>順位</th>
            {showSeat && <th>席</th>}
            <th>ユーザー</th>
            <th>起家</th>
            <th>開始家</th>
            <th>持ち点</th>
            <th>素点</th>
            <th>順位点</th>
            <th>オカ</th>
            <th>合計</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((score) => (
            <tr key={`${score.rank}-${score.name}-${score.startWind}`}>
              <td>{score.rank}</td>
              {hasSeat(score) && <td>{SEAT_LABELS[score.seat]}</td>}
              <td>{score.name}</td>
              <td>{score.isStartingDealer ? "○" : ""}</td>
              <td>{START_WIND_LABELS[score.startWind]}</td>
              <td>{score.finalPoints.toLocaleString()}</td>
              <td>{score.pointDiffScore.toFixed(1)}</td>
              <td>{scoreSign(score.rankPoint)}{score.rankPoint}</td>
              <td>{scoreSign(score.oka)}{score.oka.toFixed(1)}</td>
              <td className="score">{scoreSign(score.totalScore)}{score.totalScore.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
