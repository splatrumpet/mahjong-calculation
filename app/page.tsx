"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  calculateScores,
  DEFAULT_RETURN_POINTS,
  DEFAULT_STARTING_POINTS,
  M_LEAGUE_RANK_POINTS,
  SEAT_LABELS,
  type CalculatedScore,
  type PlayerResult,
  type Seat,
} from "@/lib/score";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type SavedGame = {
  id: string;
  playedOn: string;
  gameNumber: number;
  results: CalculatedScore[];
};

const seatOrder: Seat[] = ["self", "right", "top", "left"];
const seatClass: Record<Seat, string> = {
  self: "seat-self",
  right: "seat-right",
  top: "seat-top",
  left: "seat-left",
};

const initialPlayers: PlayerResult[] = [
  { seat: "self", name: "自分", finalPoints: DEFAULT_STARTING_POINTS, isStartingDealer: true },
  { seat: "right", name: "下家", finalPoints: DEFAULT_STARTING_POINTS, isStartingDealer: false },
  { seat: "top", name: "対面", finalPoints: DEFAULT_STARTING_POINTS, isStartingDealer: false },
  { seat: "left", name: "上家", finalPoints: DEFAULT_STARTING_POINTS, isStartingDealer: false },
];

export default function Home() {
  const today = new Date().toISOString().slice(0, 10);
  const [playedOn, setPlayedOn] = useState(today);
  const [gameNumber, setGameNumber] = useState(1);
  const [players, setPlayers] = useState<PlayerResult[]>(initialPlayers);
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadGames() {
      if (!supabase) return;

      const { data, error } = await supabase
        .from("games")
        .select("id, played_on, game_number, game_results(seat, player_name, final_points, is_starting_dealer, rank, point_diff_score, rank_point, oka, total_score)")
        .order("played_on", { ascending: false })
        .order("game_number", { ascending: false });

      if (error) {
        setMessage(`履歴の取得に失敗しました: ${error.message}`);
        return;
      }

      setSavedGames(
        (data ?? []).map((game) => ({
          id: game.id,
          playedOn: game.played_on,
          gameNumber: game.game_number,
          results: [...(game.game_results ?? [])]
            .sort((a, b) => a.rank - b.rank)
            .map((result) => ({
              seat: result.seat as Seat,
              name: result.player_name,
              finalPoints: result.final_points,
              isStartingDealer: result.is_starting_dealer,
              rank: result.rank,
              pointDiffScore: Number(result.point_diff_score),
              rankPoint: result.rank_point,
              oka: Number(result.oka),
              totalScore: Number(result.total_score),
            })),
        })),
      );
    }

    loadGames();
  }, []);

  const calculatedScores = useMemo(() => calculateScores(players), [players]);
  const pointTotal = players.reduce((sum, player) => sum + player.finalPoints, 0);

  function updatePlayer(seat: Seat, changes: Partial<PlayerResult>) {
    setPlayers((current) =>
      current.map((player) => (player.seat === seat ? { ...player, ...changes } : player)),
    );
  }

  function selectStartingDealer(seat: Seat) {
    setPlayers((current) =>
      current.map((player) => ({ ...player, isStartingDealer: player.seat === seat })),
    );
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");

    const localGame: SavedGame = {
      id: crypto.randomUUID(),
      playedOn,
      gameNumber,
      results: calculatedScores,
    };

    if (supabase) {
      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          played_on: playedOn,
          game_number: gameNumber,
          starting_points: DEFAULT_STARTING_POINTS,
          return_points: DEFAULT_RETURN_POINTS,
          rank_points: [...M_LEAGUE_RANK_POINTS],
        })
        .select("id")
        .single();

      if (gameError) {
        setMessage(`保存に失敗しました: ${gameError.message}`);
        setIsSaving(false);
        return;
      }

      const { error: resultsError } = await supabase.from("game_results").insert(
        calculatedScores.map((score) => ({
          game_id: game.id,
          seat: score.seat,
          player_name: score.name,
          final_points: score.finalPoints,
          is_starting_dealer: score.isStartingDealer,
          rank: score.rank,
          point_diff_score: score.pointDiffScore,
          rank_point: score.rankPoint,
          oka: score.oka,
          total_score: score.totalScore,
        })),
      );

      if (resultsError) {
        setMessage(`結果の保存に失敗しました: ${resultsError.message}`);
        setIsSaving(false);
        return;
      }

      localGame.id = game.id;
    }

    setSavedGames((games) => [localGame, ...games]);
    setGameNumber((number) => number + 1);
    setMessage(isSupabaseConfigured ? "Supabaseに保存しました。" : "環境変数未設定のため、画面内に一時保存しました。");
    setIsSaving(false);
  }

  return (
    <main className="container">
      <section className="hero">
        <p className="eyebrow">M League Style</p>
        <h1>Mリーグ式の順位点で、半荘結果を席順どおりに記録できます。</h1>
        <p>自分を下、下家を右、対面を上、上家を左に配置。各席は名前・点数・起家チェックだけを入力します。</p>
      </section>

      <form className="card" onSubmit={handleSave}>
        <div className="form-grid two">
          <label>
            日付
            <input type="date" value={playedOn} onChange={(event) => setPlayedOn(event.target.value)} required />
          </label>
          <label>
            何試合目
            <input type="number" min="1" value={gameNumber} onChange={(event) => setGameNumber(Number(event.target.value))} required />
          </label>
        </div>

        <section className="table-layout" aria-label="席順入力">
          {seatOrder.map((seat) => {
            const player = players.find((item) => item.seat === seat)!;

            return (
              <div className={`seat-card ${seatClass[seat]}`} key={seat}>
                <div className="seat-heading">
                  <span>{SEAT_LABELS[seat]}</span>
                  <label className="dealer-check">
                    <input
                      checked={player.isStartingDealer}
                      onChange={() => selectStartingDealer(seat)}
                      type="checkbox"
                    />
                    起家
                  </label>
                </div>
                <label>
                  名前
                  <input value={player.name} onChange={(event) => updatePlayer(seat, { name: event.target.value })} required />
                </label>
                <label>
                  点数
                  <input
                    type="number"
                    step="100"
                    value={player.finalPoints}
                    onChange={(event) => updatePlayer(seat, { finalPoints: Number(event.target.value) })}
                    required
                  />
                </label>
              </div>
            );
          })}
          <div className="table-center">
            <strong>卓</strong>
            <span>下: 自分 / 右: 下家 / 上: 対面 / 左: 上家</span>
          </div>
        </section>

        <div className={pointTotal === 100000 ? "total ok" : "total warn"}>合計点: {pointTotal.toLocaleString()}点（通常は100,000点）</div>
        <ScoreTable scores={calculatedScores} />
        <button disabled={isSaving} type="submit">{isSaving ? "保存中..." : "この半荘を記録"}</button>
        {message && <p className="message">{message}</p>}
      </form>

      <section className="card">
        <h2>記録されたスコア</h2>
        {savedGames.length === 0 ? (
          <p className="empty">まだ記録がありません。半荘結果を保存するとここに表示されます。</p>
        ) : (
          <div className="history">
            {savedGames.map((game) => (
              <article key={game.id}>
                <h3>{game.playedOn} / {game.gameNumber}試合目</h3>
                <ScoreTable scores={game.results} compact />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function ScoreTable({ scores, compact = false }: { scores: CalculatedScore[]; compact?: boolean }) {
  return (
    <div className="table-wrap">
      <table className={compact ? "compact" : ""}>
        <thead>
          <tr>
            <th>順位</th>
            <th>席</th>
            <th>名前</th>
            <th>起家</th>
            <th>持ち点</th>
            <th>素点</th>
            <th>順位点</th>
            <th>オカ</th>
            <th>合計</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((score) => (
            <tr key={`${score.rank}-${score.name}-${score.seat}`}>
              <td>{score.rank}</td>
              <td>{SEAT_LABELS[score.seat]}</td>
              <td>{score.name}</td>
              <td>{score.isStartingDealer ? "○" : ""}</td>
              <td>{score.finalPoints.toLocaleString()}</td>
              <td>{score.pointDiffScore.toFixed(1)}</td>
              <td>{score.rankPoint > 0 ? "+" : ""}{score.rankPoint}</td>
              <td>{score.oka > 0 ? "+" : ""}{score.oka.toFixed(1)}</td>
              <td className="score">{score.totalScore > 0 ? "+" : ""}{score.totalScore.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
