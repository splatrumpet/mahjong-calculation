"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  calculateScores,
  DEFAULT_RETURN_POINTS,
  DEFAULT_STARTING_POINTS,
  M_LEAGUE_RANK_POINTS,
  SEAT_LABELS,
  SEAT_ORDER,
  START_WIND_LABELS,
  type CalculatedScore,
  type PlayerResult,
  type ScoreSummary,
  type Seat,
  type StartWind,
} from "@/lib/score";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type SavedGame = {
  id: string;
  playedOn: string;
  gameNumber: number;
  groupId: string;
  userId: string;
  results: ScoreSummary[];
};

type Group = {
  id: string;
  name: string;
};

type GroupPlayer = {
  id: string;
  name: string;
  userId: string | null;
  isGuest: boolean;
};

type GroupInvitation = {
  id: string;
  groupId: string;
  groupName: string;
  email: string;
};

type RankingRow = {
  name: string;
  games: number;
  totalScore: number;
  averageScore: number;
  averageRank: number;
  topCount: number;
};

const MAX_GUEST_PLAYERS = 10;

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
  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [incomingInvitations, setIncomingInvitations] = useState<GroupInvitation[]>([]);
  const [transferGuestId, setTransferGuestId] = useState("");
  const [transferUserPlayerId, setTransferUserPlayerId] = useState("");
  const [groupPlayers, setGroupPlayers] = useState<GroupPlayer[]>([]);
  const [historyMode, setHistoryMode] = useState<"group" | "player">("group");
  const [selectedPlayerName, setSelectedPlayerName] = useState("");
  const [playedOn, setPlayedOn] = useState(today);
  const [gameNumber, setGameNumber] = useState(1);
  const [players, setPlayers] = useState<PlayerResult[]>(initialPlayers);
  const [savedGames, setSavedGames] = useState<SavedGame[]>([]);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setIsAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setMessage("");
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setSelectedGroupId("");
      setSavedGames([]);
      setGroupPlayers([]);
      setIncomingInvitations([]);
      return;
    }

    if (user.email) {
      setPlayers((current) =>
        current.map((player) => (player.seat === "self" && player.name === "自分" ? { ...player, name: user.email! } : player)),
      );
    }

    ensureProfile();
    loadGroups();
    loadIncomingInvitations();
  }, [user]);

  useEffect(() => {
    if (!selectedGroupId) {
      setSavedGames([]);
      setGroupPlayers([]);
      return;
    }

    loadGroupPlayers(selectedGroupId);
    loadGames(selectedGroupId);
  }, [selectedGroupId]);

  const calculatedScores = useMemo(() => calculateScores(players), [players]);
  const pointTotal = players.reduce((sum, player) => sum + player.finalPoints, 0);
  const playerNames = useMemo(
    () => Array.from(new Set(savedGames.flatMap((game) => game.results.map((result) => result.name)))).sort(),
    [savedGames],
  );
  const filteredGames = useMemo(() => {
    if (historyMode === "group" || !selectedPlayerName) return savedGames;

    return savedGames
      .map((game) => ({
        ...game,
        results: game.results.filter((result) => result.name === selectedPlayerName),
      }))
      .filter((game) => game.results.length > 0);
  }, [historyMode, savedGames, selectedPlayerName]);
  const rankingRows = useMemo(() => {
    const rankings = new Map<string, Omit<RankingRow, "averageScore" | "averageRank"> & { rankTotal: number }>();

    for (const game of savedGames) {
      for (const result of game.results) {
        const current = rankings.get(result.name) ?? {
          name: result.name,
          games: 0,
          totalScore: 0,
          rankTotal: 0,
          topCount: 0,
        };

        current.games += 1;
        current.totalScore += result.totalScore;
        current.rankTotal += result.rank;
        current.topCount += result.rank === 1 ? 1 : 0;
        rankings.set(result.name, current);
      }
    }

    return Array.from(rankings.values())
      .map((row) => ({
        name: row.name,
        games: row.games,
        totalScore: roundToOneDecimal(row.totalScore),
        averageScore: roundToOneDecimal(row.totalScore / row.games),
        averageRank: roundToTwoDecimals(row.rankTotal / row.games),
        topCount: row.topCount,
      }))
      .sort((a, b) => b.totalScore - a.totalScore || b.averageScore - a.averageScore || a.averageRank - b.averageRank);
  }, [savedGames]);
  const availableUserNames = groupPlayers.map((player) => player.name);
  const guestPlayers = groupPlayers.filter((player) => player.isGuest);
  const registeredGroupPlayers = groupPlayers.filter((player) => !player.isGuest && player.userId);

  async function ensureProfile() {
    if (!supabase || !user) return;

    await supabase.from("profiles").upsert({
      id: user.id,
      display_name: user.email ?? "ユーザー",
    });
  }

  async function loadGroups() {
    if (!supabase || !user) return;

    const { data, error } = await supabase
      .from("group_memberships")
      .select("groups(id, name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      setMessage(`グループの取得に失敗しました: ${error.message}`);
      return;
    }

    const loadedGroups = (data ?? [])
      .flatMap((membership) => {
        const group = membership.groups;
        if (!group) return [];
        return Array.isArray(group) ? group : [group];
      })
      .map((group) => ({ id: group.id, name: group.name }));

    setGroups(loadedGroups);
    setSelectedGroupId((current) => current || loadedGroups[0]?.id || "");
  }

  async function loadIncomingInvitations() {
    if (!supabase || !user?.email) return;

    const { data, error } = await supabase
      .from("group_invitations")
      .select("id, email, group_id, groups(name)")
      .eq("email", user.email.toLowerCase())
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`招待の取得に失敗しました: ${error.message}`);
      return;
    }

    setIncomingInvitations(
      (data ?? []).map((invitation) => {
        const group = Array.isArray(invitation.groups) ? invitation.groups[0] : invitation.groups;
        return {
          id: invitation.id,
          groupId: invitation.group_id,
          groupName: group?.name ?? "未設定グループ",
          email: invitation.email,
        };
      }),
    );
  }

  async function loadGroupPlayers(groupId: string) {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("group_players")
      .select("id, display_name, user_id, is_guest")
      .eq("group_id", groupId)
      .order("is_guest", { ascending: true })
      .order("display_name", { ascending: true });

    if (error) {
      setMessage(`ユーザー一覧の取得に失敗しました: ${error.message}`);
      return;
    }

    setGroupPlayers(
      (data ?? []).map((player) => ({
        id: player.id,
        name: player.display_name,
        userId: player.user_id,
        isGuest: player.is_guest,
      })),
    );
  }

  async function loadGames(groupId: string) {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("games")
      .select("id, played_on, game_number, group_id, user_id, game_results(player_name, final_points, is_starting_dealer, starting_wind, rank, point_diff_score, rank_point, oka, total_score)")
      .eq("group_id", groupId)
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
        groupId: game.group_id,
        userId: game.user_id,
        results: [...(game.game_results ?? [])]
          .sort((a, b) => a.rank - b.rank)
          .map((result) => ({
            name: result.player_name,
            finalPoints: result.final_points,
            isStartingDealer: result.is_starting_dealer,
            startWind: result.starting_wind as StartWind,
            rank: result.rank,
            pointDiffScore: Number(result.point_diff_score),
            rankPoint: result.rank_point,
            oka: Number(result.oka),
            totalScore: Number(result.total_score),
          })),
      })),
    );
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setMessage("");
    const { error } = authMode === "signIn"
      ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      : await supabase.auth.signUp({ email: authEmail, password: authPassword });

    if (error) {
      setMessage(`ログイン処理に失敗しました: ${error.message}`);
      return;
    }

    setMessage(authMode === "signIn" ? "ログインしました。" : "登録しました。確認メールが届いた場合はメールを確認してください。");
  }

  async function handleSignOut() {
    if (!supabase) return;

    await supabase.auth.signOut();
    setUser(null);
  }

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !newGroupName.trim()) return;

    setMessage("");
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .insert({ name: newGroupName.trim(), owner_id: user.id })
      .select("id, name")
      .single();

    if (groupError) {
      setMessage(`グループ作成に失敗しました: ${groupError.message}`);
      return;
    }

    const { error: membershipError } = await supabase
      .from("group_memberships")
      .insert({ group_id: group.id, user_id: user.id, role: "owner" });

    if (membershipError) {
      setMessage(`グループ参加情報の保存に失敗しました: ${membershipError.message}`);
      return;
    }

    const ownerName = user.email ?? "ユーザー";
    const { data: ownerPlayer, error: ownerPlayerError } = await supabase
      .from("group_players")
      .insert({
        group_id: group.id,
        user_id: user.id,
        display_name: ownerName,
        is_guest: false,
      })
      .select("id, display_name, user_id, is_guest")
      .single();

    if (ownerPlayerError) {
      setMessage(`グループユーザーの保存に失敗しました: ${ownerPlayerError.message}`);
      return;
    }

    setGroups((current) => [...current, group]);
    setGroupPlayers([{ id: ownerPlayer.id, name: ownerPlayer.display_name, userId: ownerPlayer.user_id, isGuest: ownerPlayer.is_guest }]);
    setSelectedGroupId(group.id);
    setNewGroupName("");
    setMessage("グループを作成しました。");
  }

  async function resolveGroupPlayersForScores(scores: CalculatedScore[]) {
    if (!supabase || !selectedGroupId) return new Map<string, GroupPlayer>();

    const resolved = new Map<string, GroupPlayer>();
    const existingPlayers = [...groupPlayers];
    let guestCount = existingPlayers.filter((player) => player.isGuest).length;
    const createdGuests: GroupPlayer[] = [];

    for (const score of scores) {
      const playerName = score.name.trim();
      const existingPlayer = [...existingPlayers, ...createdGuests].find((player) => player.name === playerName);
      if (existingPlayer) {
        resolved.set(playerName, existingPlayer);
        continue;
      }

      if (guestCount >= MAX_GUEST_PLAYERS) {
        throw new Error(`ゲストユーザーは${MAX_GUEST_PLAYERS}人まで保存できます。`);
      }

      const { data: guest, error } = await supabase
        .from("group_players")
        .insert({
          group_id: selectedGroupId,
          display_name: playerName,
          is_guest: true,
        })
        .select("id, display_name, user_id, is_guest")
        .single();

      if (error) throw error;

      const createdGuest = {
        id: guest.id,
        name: guest.display_name,
        userId: guest.user_id,
        isGuest: guest.is_guest,
      };
      createdGuests.push(createdGuest);
      resolved.set(playerName, createdGuest);
      guestCount += 1;
    }

    if (createdGuests.length > 0) {
      setGroupPlayers((current) => [...current, ...createdGuests]);
    }

    return resolved;
  }

  async function handleInviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || !selectedGroupId || !inviteEmail.trim()) return;

    const email = inviteEmail.trim().toLowerCase();
    const { error } = await supabase.from("group_invitations").insert({
      group_id: selectedGroupId,
      email,
      invited_by: user.id,
    });

    if (error) {
      setMessage(`ユーザー招待に失敗しました: ${error.message}`);
      return;
    }

    setInviteEmail("");
    setMessage(`${email} をグループに招待しました。`);
  }

  async function handleAcceptInvitation(invitation: GroupInvitation) {
    if (!supabase || !user) return;

    const { error: membershipError } = await supabase
      .from("group_memberships")
      .insert({ group_id: invitation.groupId, user_id: user.id, role: "member" });

    if (membershipError) {
      setMessage(`招待の参加処理に失敗しました: ${membershipError.message}`);
      return;
    }

    const displayName = user.email ?? invitation.email;
    const { error: playerError } = await supabase.from("group_players").insert({
      group_id: invitation.groupId,
      user_id: user.id,
      display_name: displayName,
      is_guest: false,
    });

    if (playerError) {
      setMessage(`グループユーザー登録に失敗しました: ${playerError.message}`);
      return;
    }

    await supabase.from("group_invitations").update({ status: "accepted" }).eq("id", invitation.id);
    setMessage(`${invitation.groupName} に参加しました。`);
    loadGroups();
    loadIncomingInvitations();
  }

  async function handleTransferGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !transferGuestId || !transferUserPlayerId) return;

    const guestPlayer = groupPlayers.find((player) => player.id === transferGuestId);
    const targetPlayer = groupPlayers.find((player) => player.id === transferUserPlayerId);
    if (!guestPlayer || !targetPlayer?.userId) return;

    const { error: updateError } = await supabase
      .from("game_results")
      .update({
        player_user_id: targetPlayer.userId,
        guest_player_id: null,
        player_name: targetPlayer.name,
      })
      .eq("guest_player_id", guestPlayer.id);

    if (updateError) {
      setMessage(`ゲスト結果の移行に失敗しました: ${updateError.message}`);
      return;
    }

    const { error: deleteError } = await supabase.from("group_players").delete().eq("id", guestPlayer.id);

    if (deleteError) {
      setMessage(`ゲストユーザー削除に失敗しました: ${deleteError.message}`);
      return;
    }

    setGroupPlayers((current) => current.filter((player) => player.id !== guestPlayer.id));
    setSavedGames((games) =>
      games.map((game) => ({
        ...game,
        results: game.results.map((result) =>
          result.name === guestPlayer.name ? { ...result, name: targetPlayer.name } : result,
        ),
      })),
    );
    setTransferGuestId("");
    setTransferUserPlayerId("");
    setMessage(`${guestPlayer.name} の記録を ${targetPlayer.name} に移行しました。`);
  }

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
    if (!user || !selectedGroupId) {
      setMessage("ログインしてグループを選択してから保存してください。");
      return;
    }

    setIsSaving(true);
    setMessage("");

    const localGame: SavedGame = {
      id: crypto.randomUUID(),
      playedOn,
      gameNumber,
      groupId: selectedGroupId,
      userId: user.id,
      results: calculatedScores.map(toScoreSummary),
    };

    if (supabase) {
      let resolvedPlayers: Map<string, GroupPlayer>;
      try {
        resolvedPlayers = await resolveGroupPlayersForScores(calculatedScores);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "ユーザー情報の保存に失敗しました。");
        setIsSaving(false);
        return;
      }

      const { data: game, error: gameError } = await supabase
        .from("games")
        .insert({
          user_id: user.id,
          group_id: selectedGroupId,
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
          player_name: score.name,
          player_user_id: resolvedPlayers.get(score.name.trim())?.userId ?? null,
          guest_player_id: resolvedPlayers.get(score.name.trim())?.isGuest ? resolvedPlayers.get(score.name.trim())?.id : null,
          final_points: score.finalPoints,
          is_starting_dealer: score.isStartingDealer,
          starting_wind: score.startWind,
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
    setMessage("Supabaseに保存しました。");
    setIsSaving(false);
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="container">
        <section className="hero">
          <p className="eyebrow">M League Style</p>
          <h1>ログイン機能を利用するにはSupabase設定が必要です。</h1>
          <p>環境変数に Supabase URL と publishable key を設定してから利用してください。</p>
        </section>
      </main>
    );
  }

  if (isAuthLoading) {
    return <main className="container"><p className="message">ログイン状態を確認しています...</p></main>;
  }

  if (!user) {
    return (
      <main className="container auth-container">
        <section className="hero">
          <p className="eyebrow">M League Style</p>
          <h1>ログインしたユーザーだけが利用できます。</h1>
          <p>ログイン後にグループを作成し、試合結果をグループ単位・個人単位で確認できます。</p>
        </section>

        <form className="card auth-card" onSubmit={handleAuth}>
          <h2>{authMode === "signIn" ? "ログイン" : "新規登録"}</h2>
          <label>
            メールアドレス
            <input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required />
          </label>
          <label>
            パスワード
            <input type="password" minLength={6} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required />
          </label>
          <button type="submit">{authMode === "signIn" ? "ログイン" : "登録"}</button>
          <button className="secondary-button" type="button" onClick={() => setAuthMode(authMode === "signIn" ? "signUp" : "signIn")}>
            {authMode === "signIn" ? "新規登録はこちら" : "ログインに戻る"}
          </button>
          {message && <p className="message">{message}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="container">
      <section className="hero">
        <div className="user-bar">
          <p className="eyebrow">M League Style</p>
          <button className="secondary-button inverted" type="button" onClick={handleSignOut}>ログアウト</button>
        </div>
        <h1>Mリーグ式の順位点で、半荘結果を席順どおりに記録できます。</h1>
        <p>ログイン中: {user.email}。先に記録先グループを選ぶと、結果をグループ単位・個人単位で確認できます。</p>
      </section>

      <section className="card group-panel">
        <div>
          <h2>グループ</h2>
          <p className="help-text">試合結果は選択中のグループに保存されます。ユーザー名が一覧にない場合はゲストユーザーとして保存します（最大10人）。</p>
        </div>
        <label>
          確認・保存するグループ
          <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
            <option value="">グループを選択</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </label>
        <form className="inline-form" onSubmit={handleCreateGroup}>
          <label>
            新しいグループ名
            <input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="例: 週末麻雀部" />
          </label>
          <button type="submit">グループ作成</button>
        </form>
      </section>

      {incomingInvitations.length > 0 && (
        <section className="card member-panel">
          <h2>届いているグループ招待</h2>
          <div className="member-list">
            {incomingInvitations.map((invitation) => (
              <div className="member-row" key={invitation.id}>
                <span>{invitation.groupName}</span>
                <button type="button" onClick={() => handleAcceptInvitation(invitation)}>参加する</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedGroupId && (
        <section className="card member-panel">
          <div>
            <h2>グループユーザー管理</h2>
            <p className="help-text">メールアドレスでユーザーを招待できます。ゲストの記録は、後から参加したユーザーへ移行できます。</p>
          </div>
          <form className="inline-form" onSubmit={handleInviteUser}>
            <label>
              招待するメールアドレス
              <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="user@example.com" />
            </label>
            <button type="submit">招待</button>
          </form>
          <div className="member-columns">
            <div>
              <h3>登録ユーザー</h3>
              <div className="member-list">
                {registeredGroupPlayers.length === 0 ? (
                  <p className="empty">登録ユーザーはいません。</p>
                ) : registeredGroupPlayers.map((player) => (
                  <div className="member-row" key={player.id}>
                    <span>{player.name}</span>
                    <span className="badge">ユーザー</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3>ゲストユーザー</h3>
              <div className="member-list">
                {guestPlayers.length === 0 ? (
                  <p className="empty">ゲストユーザーはいません。</p>
                ) : guestPlayers.map((player) => (
                  <div className="member-row" key={player.id}>
                    <span>{player.name}</span>
                    <span className="badge guest">ゲスト</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <form className="inline-form" onSubmit={handleTransferGuest}>
            <label>
              移行元ゲスト
              <select value={transferGuestId} onChange={(event) => setTransferGuestId(event.target.value)}>
                <option value="">選択してください</option>
                {guestPlayers.map((player) => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
              </select>
            </label>
            <label>
              移行先ユーザー
              <select value={transferUserPlayerId} onChange={(event) => setTransferUserPlayerId(event.target.value)}>
                <option value="">選択してください</option>
                {registeredGroupPlayers.map((player) => (
                  <option key={player.id} value={player.id}>{player.name}</option>
                ))}
              </select>
            </label>
            <button disabled={!transferGuestId || !transferUserPlayerId} type="submit">ゲスト記録を移行</button>
          </form>
        </section>
      )}

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

        <datalist id="group-user-options">
          {availableUserNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <section className="table-layout" aria-label="席順入力">
          {SEAT_ORDER.map((seat) => {
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
                    起家（開始時の東家）
                  </label>
                </div>
                <label>
                  ユーザー
                  <input list="group-user-options" value={player.name} onChange={(event) => updatePlayer(seat, { name: event.target.value })} required />
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
        <button disabled={isSaving || !selectedGroupId} type="submit">{isSaving ? "保存中..." : selectedGroupId ? "この半荘を記録" : "先にグループを選択"}</button>
        {message && <p className="message">{message}</p>}
      </form>

      <section className="card">
        <div className="history-heading">
          <div>
            <h2>グループ内ランキング</h2>
            <p className="help-text">選択中グループの保存済み試合を集計し、合計スコア順に表示します。</p>
          </div>
        </div>
        {rankingRows.length === 0 ? (
          <p className="empty">ランキングに表示できる記録がありません。</p>
        ) : (
          <div className="table-wrap">
            <table className="compact ranking-table">
              <thead>
                <tr>
                  <th>順位</th>
                  <th>ユーザー</th>
                  <th>試合数</th>
                  <th>合計</th>
                  <th>平均</th>
                  <th>平均順位</th>
                  <th>トップ回数</th>
                </tr>
              </thead>
              <tbody>
                {rankingRows.map((row, index) => (
                  <tr key={row.name}>
                    <td>{index + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.games}</td>
                    <td className="score">{row.totalScore > 0 ? "+" : ""}{row.totalScore.toFixed(1)}</td>
                    <td>{row.averageScore > 0 ? "+" : ""}{row.averageScore.toFixed(1)}</td>
                    <td>{row.averageRank.toFixed(2)}</td>
                    <td>{row.topCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="history-heading">
          <div>
            <h2>記録されたスコア</h2>
            <p className="help-text">グループ全体、またはプレイヤー個人の結果に切り替えて確認できます。</p>
          </div>
          <div className="history-controls">
            <label>
              表示単位
              <select value={historyMode} onChange={(event) => setHistoryMode(event.target.value as "group" | "player")}>
                <option value="group">グループ単位</option>
                <option value="player">個人単位</option>
              </select>
            </label>
            {historyMode === "player" && (
              <label>
                プレイヤー
                <select value={selectedPlayerName} onChange={(event) => setSelectedPlayerName(event.target.value)}>
                  <option value="">選択してください</option>
                  {playerNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
        {filteredGames.length === 0 ? (
          <p className="empty">表示できる記録がありません。グループを選択して半荘結果を保存してください。</p>
        ) : (
          <div className="history">
            {filteredGames.map((game) => (
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

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function toScoreSummary({ seat: _seat, ...score }: CalculatedScore): ScoreSummary {
  return score;
}

function hasSeat(score: ScoreSummary | CalculatedScore): score is CalculatedScore {
  return "seat" in score;
}

function ScoreTable({ scores, compact = false }: { scores: Array<ScoreSummary | CalculatedScore>; compact?: boolean }) {
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
