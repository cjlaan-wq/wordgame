import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, set, onValue, update, get, runTransaction } from "firebase/database";
import "./App.css";

// ─── Helpers ────────────────────────────────────────────────────────────────

function randomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getMyId() {
  let id = sessionStorage.getItem("wordgame_myid");
  if (!id) {
    id = Math.random().toString(36).substring(2, 10);
    sessionStorage.setItem("wordgame_myid", id);
  }
  return id;
}

// ─── Constants ───────────────────────────────────────────────────────────────

// FIX: removed duplicate 🦋 (was at index 4 and 19)
const AVATAR_EMOJIS = [
  "🐶","🦊","🐸","🐙","🦁","🐼","🦄","🐯","🦀",
  "🐳","🦜","🐝","🦔","🐲","🦩","🐠","🦭","🐨","🦋","🐻"
];

const REACTION_EMOJIS = ["😂", "🔥", "😮", "👏", "💀"];

// ─── Sub-components ──────────────────────────────────────────────────────────

function Avatar({ name, emoji, size = 36 }) {
  const colors = ["#C8B8F5","#9FE1CB","#F5C4B3","#B5D4F4","#FAC775","#F4C0D1"];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: colors[idx], display: "flex", alignItems: "center",
      justifyContent: "center",
      fontSize: emoji ? size * 0.52 : size * 0.38,
      fontWeight: 600, color: "#2C2C2A", flexShrink: 0
    }}>
      {emoji || (name ? name[0].toUpperCase() : "?")}
    </div>
  );
}

function TimerRing({ seconds, total, size = 120 }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, seconds / total);
  const offset = circ * (1 - pct);
  const color = seconds <= 5 ? "#E24B4A" : seconds <= 10 ? "#EF9F27" : "#2C2C2A";
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto 1.5rem" }}>
      <svg width={size} height={size} viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#E8E6E0" strokeWidth="6" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.9s linear, stroke 0.3s" }} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 32, fontWeight: 600, color
      }}>{Math.max(0, seconds)}</div>
    </div>
  );
}

function VoteTally({ votes, playerList, ownerName, eligibleVoters }) {
  const tally = {};
  Object.values(votes).forEach(v => { tally[v.name] = (tally[v.name] || 0) + 1; });
  const voteCount = Object.keys(votes).length;
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
        {voteCount} of {eligibleVoters.length} voted
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {playerList.map(p => {
          const count = tally[p.name] || 0;
          const isOwner = p.name === ownerName;
          return (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: count > 0 ? "var(--text)" : "var(--surface)",
              color: count > 0 ? "var(--bg)" : "var(--text)",
              border: isOwner ? "0.5px dashed var(--border)" : "0.5px solid var(--border)",
              borderRadius: 999, padding: "6px 14px", fontSize: 14,
              opacity: isOwner ? 0.5 : 1, transition: "all 0.2s"
            }}>
              {p.emoji && <span style={{ fontSize: 16 }}>{p.emoji}</span>}
              {p.name}
              {count > 0 && (
                <span style={{
                  background: "rgba(255,255,255,0.25)", borderRadius: 999,
                  padding: "1px 7px", fontSize: 12, fontWeight: 600
                }}>{count}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// FIX: silhouette uses opacity trick so emoji shape is visible as dark blob,
// then fades in colour on reveal — works with or without emoji
function SilhouetteReveal({ name, emoji, revealed }) {
  const colors = ["#C8B8F5","#9FE1CB","#F5C4B3","#B5D4F4","#FAC775","#F4C0D1"];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  return (
    <div style={{ textAlign: "center", marginBottom: "1rem" }}>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12, fontWeight: 500, letterSpacing: "0.05em" }}>
        {revealed ? name : "Who's this player?!"}
      </div>
      <div style={{ position: "relative", width: 90, height: 90, margin: "0 auto 0.75rem" }}>
        {/* Coloured background circle — fades in on reveal */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: colors[idx],
          opacity: revealed ? 1 : 0,
          transition: "opacity 0.4s ease",
          animation: revealed ? "silhouetteFlip 0.5s ease-in-out" : "none"
        }} />
        {/* Dark silhouette layer — fades out on reveal */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "#1A1916",
          opacity: revealed ? 0 : 1,
          transition: "opacity 0.4s ease"
        }} />
        {/* Emoji — always rendered, invisible on dark bg until revealed */}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 46, zIndex: 1,
          filter: revealed ? "none" : "brightness(0)",
          transition: "filter 0.3s ease 0.2s"
        }}>
          {emoji || name?.[0]?.toUpperCase() || "?"}
        </div>
      </div>
      {revealed && (
        <div style={{ fontSize: 24, fontWeight: 600, color: "var(--text)", animation: "scorePop 0.4s ease-out" }}>
          {name}!
        </div>
      )}
    </div>
  );
}

function FloatingReactions({ reactions }) {
  return (
    <div style={{
      position: "fixed", bottom: 80, left: 0, right: 0,
      pointerEvents: "none", zIndex: 100,
      display: "flex", justifyContent: "center"
    }}>
      {reactions.map(r => (
        <span key={r.id} style={{
          position: "absolute", fontSize: 32,
          left: `${r.x}%`,
          animation: "floatUp 1.8s ease-out forwards"
        }}>{r.emoji}</span>
      ))}
    </div>
  );
}

function ReactionBar({ onReact }) {
  const [cooldowns, setCooldowns] = useState({});
  function handleTap(emoji) {
    if (cooldowns[emoji]) return;
    onReact(emoji);
    setCooldowns(c => ({ ...c, [emoji]: true }));
    setTimeout(() => setCooldowns(c => ({ ...c, [emoji]: false })), 800);
  }
  return (
    <div style={{
      display: "flex", justifyContent: "center", gap: 12,
      marginTop: "1.5rem", padding: "0.75rem 1rem",
      background: "var(--surface)", border: "0.5px solid var(--border)",
      borderRadius: 999
    }}>
      {REACTION_EMOJIS.map(emoji => (
        <button key={emoji} onClick={() => handleTap(emoji)} style={{
          background: "none", border: "none", fontSize: 28,
          cursor: "pointer", padding: "4px 2px",
          opacity: cooldowns[emoji] ? 0.3 : 1,
          transform: cooldowns[emoji] ? "scale(0.85)" : "scale(1)",
          transition: "opacity 0.15s, transform 0.15s"
        }}>{emoji}</button>
      ))}
    </div>
  );
}

function Confetti() {
  const pieces = useRef([...Array(60)].map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 1.5,
    duration: 2 + Math.random() * 2,
    color: ["#C8B8F5","#9FE1CB","#F5C4B3","#B5D4F4","#FAC775","#F4C0D1","#1A1916"][Math.floor(Math.random()*7)],
    size: 6 + Math.random() * 8
  }))).current;
  return (
    <>
      {pieces.map(p => (
        <div key={p.id} className="confetti-piece" style={{
          left: `${p.x}%`, top: -20,
          width: p.size, height: p.size,
          background: p.color,
          animationDuration: `${p.duration}s`,
          animationDelay: `${p.delay}s`
        }} />
      ))}
    </>
  );
}

function CountdownSplash({ number }) {
  return (
    <div className="countdown-overlay">
      <div className="countdown-number" key={number}>{number === 0 ? "Go!" : number}</div>
    </div>
  );
}

function FlashOverlay() {
  return <div className="flash-overlay" />;
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("home");
  const [gameCode, setGameCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const myId = useRef(getMyId()).current;
  const [game, setGame] = useState(null);
  const [words, setWords] = useState(["", "", ""]);
  const [myVote, setMyVote] = useState(null);
  const [voteConfirmed, setVoteConfirmed] = useState(false);
  const [timer, setTimer] = useState(0);
  const [timerTotal, setTimerTotal] = useState(30);
  const [error, setError] = useState("");
  const [editingWords, setEditingWords] = useState(false);
  const timerRef = useRef(null);
  const revealTriggeredRef = useRef(false);
  const [floatingReactions, setFloatingReactions] = useState([]);
  const seenReactionsRef = useRef(new Set());
  const [countdown, setCountdown] = useState(null);
  const [showFlash, setShowFlash] = useState(false);
  const [ownerRevealed, setOwnerRevealed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [scorePopName, setScorePopName] = useState(null);
  const countdownRef = useRef(null);

  // ── Derived state ──────────────────────────────────────────────────────────
  const phase = game?.phase;
  const players = game?.players || {};
  const playerList = Object.entries(players).map(([id, p]) => ({ id, ...p }));
  const isHost = game?.hostId === myId;
  const myPlayer = players[myId];
  const myName = myPlayer?.name || playerName;
  const myEmoji = myPlayer?.emoji || "";
  const currentRound = game?.rounds && game.currentRoundIdx >= 0
    ? game.rounds[game.currentRoundIdx] : null;

  const isDescriber = currentRound?.describerName === myName;
  const isOwner = currentRound?.ownerName === myName;

  const votes = currentRound?.votes || {};
  const voteCount = Object.keys(votes).length;
  const eligibleVoters = playerList.filter(p => p.name !== currentRound?.ownerName);
  const allVoted = eligibleVoters.length > 0 && voteCount >= eligibleVoters.length;

  // Emojis already claimed by other players in the lobby
  const takenEmojis = new Set(
    playerList.filter(p => p.id !== myId && p.emoji).map(p => p.emoji)
  );
  const availableEmojis = AVATAR_EMOJIS.filter(e => !takenEmojis.has(e));

  // ── Firebase listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameCode) return;
    const r = ref(db, `games/${gameCode}`);
    const unsub = onValue(r, snap => {
      const data = snap.val();
      if (!data) return;
      // Strip reactions node — handled by its own listener to avoid re-renders
      const { reactions: _, ...gameData } = data;
      setGame(gameData);
      if (gameData.phase === "lobby") setScreen("lobby");
      if (gameData.timerStart && gameData.timerDuration) {
        const elapsed = Math.floor((Date.now() - gameData.timerStart) / 1000);
        setTimer(Math.max(0, gameData.timerDuration - elapsed));
        setTimerTotal(gameData.timerDuration);
      }
    });
    return () => unsub();
  }, [gameCode]);

  // ── Timer tick ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!game?.timerStart) return;
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - game.timerStart) / 1000);
      setTimer(Math.max(0, game.timerDuration - elapsed));
    }, 500);
    return () => clearInterval(timerRef.current);
  }, [game?.timerStart, game?.timerDuration]);

  // ── Reaction listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameCode) return;
    const r = ref(db, `games/${gameCode}/reactions`);
    const unsub = onValue(r, snap => {
      const data = snap.val();
      if (!data) return;
      const now = Date.now();
      Object.entries(data).forEach(([id, reaction]) => {
        if (seenReactionsRef.current.has(id)) return;
        if (now - reaction.ts > 2000) return;
        seenReactionsRef.current.add(id);
        const floatId = `${id}-${now}`;
        const x = 20 + Math.random() * 60;
        setFloatingReactions(prev => [...prev, { id: floatId, emoji: reaction.emoji, x }]);
        setTimeout(() => {
          setFloatingReactions(prev => prev.filter(r => r.id !== floatId));
        }, 1800);
      });
    });
    return () => unsub();
  }, [gameCode]);

  async function sendReaction(emoji) {
    const reactionId = `${myId}_${Date.now()}`;
    await set(ref(db, `games/${gameCode}/reactions/${reactionId}`), {
      emoji, ts: Date.now(), senderId: myId
    });
    setTimeout(() => set(ref(db, `games/${gameCode}/reactions/${reactionId}`), null), 3000);
  }

  // ── Vibrate describer on pregame ───────────────────────────────────────────
  useEffect(() => {
    if (phase === "pregame" && isDescriber && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  }, [phase, isDescriber]);

  // ── Reset state on new round ───────────────────────────────────────────────
  useEffect(() => {
    setMyVote(null);
    setVoteConfirmed(false);
    revealTriggeredRef.current = false;
    setOwnerRevealed(false);
    setShowFlash(false);
    setScorePopName(null);
  }, [game?.currentRoundIdx]);

  // ── Countdown — only for non-describers (FIX: describer sees word instantly)
  useEffect(() => {
    if (phase !== "describe") {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setCountdown(null);
      }
      return;
    }
    if (isDescriber) return; // describer sees word immediately, no countdown
    if (countdownRef.current) return;
    setCountdown(3);
    let n = 3;
    countdownRef.current = setInterval(() => {
      n--;
      if (n < 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setCountdown(null);
      } else {
        setCountdown(n);
      }
    }, 900);
    return () => {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    };
  }, [phase, isDescriber]);

  // ── Flash + reveal effects when phase becomes "reveal" ─────────────────────
  useEffect(() => {
    if (phase !== "reveal") return;
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 600);
    setTimeout(() => setOwnerRevealed(true), 800);
  }, [phase]);

  // FIX: score pop reads from game data once ownerRevealed fires,
  // by which time Firebase has updated currentRound with ownerGuessName
  useEffect(() => {
    if (!ownerRevealed) return;
    if (currentRound?.ownerGuessCorrect && currentRound?.ownerGuessName) {
      setScorePopName(currentRound.ownerGuessName);
    }
  }, [ownerRevealed]);

  // ── Confetti on scoreboard ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "scoreboard") return;
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  }, [phase]);

  // ── Auto-reveal when all votes in (host only) ──────────────────────────────
  useEffect(() => {
    if (!allVoted || phase !== "guess-owner" || !isHost) return;
    if (revealTriggeredRef.current) return;
    revealTriggeredRef.current = true;

    const tally = {};
    Object.values(votes).forEach(v => { tally[v.name] = (tally[v.name] || 0) + 1; });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const topName = sorted[0]?.[0];
    const isTie = sorted.length > 1 && sorted[1][1] === sorted[0]?.[1];

    if (isTie) {
      const updates = {};
      updates[`games/${gameCode}/rounds/${game.currentRoundIdx}/ownerGuessName`] = null;
      updates[`games/${gameCode}/rounds/${game.currentRoundIdx}/ownerGuessCorrect`] = false;
      updates[`games/${gameCode}/rounds/${game.currentRoundIdx}/tie`] = true;
      updates[`games/${gameCode}/phase`] = "reveal";
      update(ref(db), updates);
      return;
    }

    const topEntry = playerList.find(p => p.name === topName);
    if (!topEntry) return;

    const correct = topEntry.name === currentRound.ownerName;
    const updates = {};
    updates[`games/${gameCode}/rounds/${game.currentRoundIdx}/ownerGuessName`] = topEntry.name;
    updates[`games/${gameCode}/rounds/${game.currentRoundIdx}/ownerGuessCorrect`] = correct;
    updates[`games/${gameCode}/phase`] = "reveal";
    update(ref(db), updates);

    if (correct && currentRound.wordGuessed) {
      runTransaction(ref(db, `games/${gameCode}/players/${topEntry.id}/score`), s => (s || 0) + 1);
    }
  }, [allVoted, phase, isHost]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function createGame() {
    if (!playerName.trim()) { setError("Enter your name first."); return; }
    const code = randomCode();
    await set(ref(db, `games/${code}`), {
      hostId: myId,
      hostName: playerName.trim(),
      status: "lobby",
      // emoji left empty — player picks in lobby
      players: { [myId]: { name: playerName.trim(), emoji: "", ready: false, score: 0 } },
      rounds: null,
      currentRoundIdx: -1,
      phase: "lobby"
    });
    setGameCode(code);
    setScreen("lobby");
  }

  async function joinGame() {
    if (!playerName.trim()) { setError("Enter your name first."); return; }
    if (!joinCode.trim()) { setError("Enter a game code."); return; }
    const code = joinCode.trim().toUpperCase();
    const snap = await get(ref(db, `games/${code}`));
    if (!snap.exists()) { setError("Game not found. Check the code."); return; }
    const data = snap.val();
    if (data.status !== "lobby") { setError("This game has already started."); return; }

    const existingNames = Object.values(data.players || {}).map(p => p.name.toLowerCase().trim());
    if (existingNames.includes(playerName.toLowerCase().trim())) {
      setError(`The name "${playerName.trim()}" is already taken. Pick a different name.`);
      return;
    }

    await update(ref(db, `games/${code}/players/${myId}`), {
      name: playerName.trim(), emoji: "", ready: false, score: 0
    });
    setGameCode(code);
    setScreen("lobby");
  }

  async function pickEmoji(emoji) {
    // Double-check it's not taken (race condition guard)
    if (takenEmojis.has(emoji)) return;
    await update(ref(db, `games/${gameCode}/players/${myId}`), { emoji });
  }

  async function submitWords() {
    if (!myEmoji) { setError("Pick an avatar first!"); return; }
    const filled = words.filter(w => w.trim());
    if (filled.length < 2) { setError("Add at least 2 words."); return; }
    await update(ref(db, `games/${gameCode}/players/${myId}`), {
      words: filled.map(w => w.trim()), ready: true
    });
    setError("");
    setEditingWords(false);
  }

  async function startGame() {
    const ids = Object.keys(players);
    if (ids.length < 2) { setError("Need at least 2 players."); return; }
    const notReady = ids.filter(id => !players[id].ready);
    if (notReady.length > 0) {
      setError(`Still waiting for: ${notReady.map(id => players[id].name).join(", ")}`);
      return;
    }

    let allWords = [];
    ids.forEach(id => {
      (players[id].words || []).forEach(w => {
        allWords.push({ word: w, ownerName: players[id].name, ownerId: id });
      });
    });
    allWords = shuffle(allWords);

    const names = ids.map(id => players[id].name);
    const rounds = allWords.map((w, i) => {
      const available = names.filter(n => n !== w.ownerName);
      return {
        word: w.word,
        ownerName: w.ownerName,
        ownerId: w.ownerId,
        describerName: available[i % available.length],
        wordGuessed: false,
        votes: {},
        ownerGuessName: null,
        ownerGuessCorrect: false,
        skipped: false
      };
    });

    await update(ref(db, `games/${gameCode}`), {
      rounds, currentRoundIdx: 0, status: "playing",
      phase: "pregame", timerStart: null, timerDuration: null
    });
  }

  async function beginDescribe() {
    await update(ref(db, `games/${gameCode}`), {
      phase: "describe", timerStart: Date.now(), timerDuration: 30
    });
  }

  async function markWordGuessed() {
    const idx = game.currentRoundIdx;
    await update(ref(db, `games/${gameCode}/rounds/${idx}`), { wordGuessed: true });
    await update(ref(db, `games/${gameCode}`), {
      phase: "guess-owner", timerStart: null, timerDuration: null
    });
  }

  async function skipWord() {
    const idx = game.currentRoundIdx;
    await update(ref(db, `games/${gameCode}/rounds/${idx}`), { skipped: true, wordGuessed: false });
    await update(ref(db, `games/${gameCode}`), {
      phase: "guess-owner", timerStart: null, timerDuration: null
    });
  }

  async function confirmMyVote() {
    if (!myVote || isOwner) return;
    await update(ref(db, `games/${gameCode}/rounds/${game.currentRoundIdx}/votes/${myId}`), {
      name: myVote.name, voterId: myId
    });
    setVoteConfirmed(true);
  }

  async function startElaborate() {
    await update(ref(db, `games/${gameCode}`), {
      phase: "elaborate", timerStart: Date.now(), timerDuration: 60
    });
  }

  async function nextRound() {
    const nextIdx = game.currentRoundIdx + 1;
    if (nextIdx >= game.rounds.length) {
      await update(ref(db, `games/${gameCode}`), { phase: "scoreboard", status: "done" });
    } else {
      await update(ref(db, `games/${gameCode}`), {
        currentRoundIdx: nextIdx, phase: "pregame",
        timerStart: null, timerDuration: null
      });
    }
  }

  async function resetGame() {
    const updates = {};
    Object.keys(players).forEach(id => {
      updates[`games/${gameCode}/players/${id}/score`] = 0;
      updates[`games/${gameCode}/players/${id}/ready`] = false;
      updates[`games/${gameCode}/players/${id}/words`] = null;
      // emoji kept — players don't re-pick on play again
    });
    updates[`games/${gameCode}/rounds`] = null;
    updates[`games/${gameCode}/currentRoundIdx`] = -1;
    updates[`games/${gameCode}/status`] = "lobby";
    updates[`games/${gameCode}/phase`] = "lobby";
    updates[`games/${gameCode}/timerStart`] = null;
    updates[`games/${gameCode}/timerDuration`] = null;
    await update(ref(db), updates);
    setWords(["", "", ""]);
    setEditingWords(false);
  }

  // ── Screens ────────────────────────────────────────────────────────────────

  if (screen === "home") return (
    <div className="screen">
      <div className="logo">30s words</div>
      <p className="subtitle">The getting-to-know-you game</p>
      <div className="card">
        <label>Your name</label>
        <input value={playerName} onChange={e => { setPlayerName(e.target.value); setError(""); }}
          placeholder="e.g. Sara" onKeyDown={e => e.key === "Enter" && createGame()} />
        {error && <p className="error">{error}</p>}
        <button className="btn-primary" onClick={createGame}>Create new game</button>
        <div className="divider"><span>or join one</span></div>
        <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Game code (e.g. X7KP)" maxLength={4}
          style={{ letterSpacing: "0.15em", textTransform: "uppercase" }} />
        <button className="btn-secondary" onClick={joinGame}>Join game</button>
      </div>
    </div>
  );

  if (screen === "lobby" && phase === "lobby") return (
    <div className="screen">
      <div className="phase-tag">Lobby</div>
      <div className="game-code">{gameCode}</div>
      <p className="subtitle" style={{ marginBottom: "1.5rem" }}>Share this code with your team</p>

      {/* FIX: emoji picker in lobby, only shows unclaimed emojis */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <label>Pick your avatar
          {myEmoji && <span style={{ marginLeft: 8, fontSize: 20 }}>{myEmoji}</span>}
        </label>
        {availableEmojis.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>All avatars are taken!</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {/* FIX: use index as key, not emoji value */}
            {availableEmojis.map((e, i) => (
              <button key={i} onClick={() => pickEmoji(e)} style={{
                fontSize: 26, background: myEmoji === e ? "var(--text)" : "var(--bg)",
                border: `1.5px solid ${myEmoji === e ? "var(--text)" : "var(--border)"}`,
                borderRadius: 12, width: 46, height: 46, cursor: "pointer",
                transition: "all 0.15s", transform: myEmoji === e ? "scale(1.15)" : "scale(1)"
              }}>{e}</button>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <label>Your words <span style={{ fontWeight: 400, color: "var(--muted)" }}>(2–3, fun &amp; weird encouraged)</span></label>
        {(editingWords || !myPlayer?.ready) ? (
          <>
            {words.map((w, i) => (
              <input key={i} value={w}
                onChange={e => { const nw = [...words]; nw[i] = e.target.value; setWords(nw); }}
                placeholder={i === 2 ? "Word 3 (optional)" : `Word ${i + 1}`} />
            ))}
            {error && <p className="error">{error}</p>}
            <button className="btn-primary" onClick={submitWords}>Submit my words</button>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="badge-success">Words submitted!</div>
            <button className="btn-small" onClick={() => { setEditingWords(true); setError(""); }}>Edit</button>
          </div>
        )}
      </div>

      <div className="card">
        <label>Players ({playerList.length})</label>
        {playerList.map(p => (
          <div key={p.id} className="player-row">
            <Avatar name={p.name} emoji={p.emoji} />
            <span>
              {p.name} {p.id === myId ? "(you)" : ""}
              {p.name === game?.hostName && <span className="host-tag"> · host</span>}
            </span>
            <span className={p.ready ? "badge-success" : "badge-waiting"}>
              {p.ready ? "ready" : p.emoji ? "typing..." : "picking..."}
            </span>
          </div>
        ))}
      </div>

      {isHost ? (
        <button className="btn-primary" onClick={startGame} style={{ marginTop: "1rem" }}>
          Start game →
        </button>
      ) : (
        <p className="muted-note">Waiting for <strong>{game?.hostName}</strong> to start...</p>
      )}
      {error && <p className="error" style={{ marginTop: 8, textAlign: "center" }}>{error}</p>}
    </div>
  );

  if (phase === "pregame" && currentRound) return (
    <div className="screen">
      <div className="phase-tag">Round {game.currentRoundIdx + 1} of {game.rounds.length}</div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(game.currentRoundIdx / game.rounds.length) * 100}%` }} />
      </div>

      {isDescriber && (
        <div className="highlight-card describer">
          <div className="highlight-label">Your turn to describe!</div>
          <p>You'll see the word. Get everyone to say it — no saying or spelling it!</p>
        </div>
      )}
      {isOwner && (
        <div className="highlight-card owner">
          <div className="highlight-label">Your word is up — sit this one out</div>
          <p>Stay poker-faced when the word appears!</p>
        </div>
      )}
      {!isDescriber && !isOwner && (
        <div className="highlight-card neutral">
          <div className="highlight-label">Get ready to guess</div>
          <p><strong>{currentRound.describerName}</strong> is describing.<br /><strong>{currentRound.ownerName}</strong> sits out this round.</p>
        </div>
      )}

      {game.currentRoundIdx + 1 < game.rounds.length &&
        game.rounds[game.currentRoundIdx + 1].describerName === myName && (
        <p className="muted-note" style={{ marginTop: "0.75rem" }}>
          Heads up — you're describing next round too!
        </p>
      )}

      {isHost ? (
        <button className="btn-primary" onClick={beginDescribe} style={{ marginTop: "1.5rem" }}>
          Show the word to {currentRound.describerName}
        </button>
      ) : (
        <p className="muted-note">Waiting for <strong>{game?.hostName}</strong> to start the round...</p>
      )}
    </div>
  );

  if (phase === "describe" && currentRound) return (
    <div className="screen" style={{ animation: timer <= 10 && timer > 0 ? "panicPulse 0.6s ease-in-out infinite" : "none" }}>
      <FloatingReactions reactions={floatingReactions} />
      {/* FIX: countdown only shows for non-describers */}
      {countdown !== null && !isDescriber && <CountdownSplash number={countdown} />}
      <div className="phase-tag">Describe the word</div>
      <TimerRing seconds={timer} total={timerTotal} />
      {isDescriber ? (
        <>
          <div className="word-display word-slam" key={currentRound.word}>{currentRound.word}</div>
          <p className="muted-note" style={{ marginBottom: "1.5rem" }}>No saying the word, no spelling it out!</p>
          <button className="btn-primary" onClick={markWordGuessed}>Word guessed!</button>
          <button className="btn-secondary" onClick={skipWord}>Skip this word</button>
        </>
      ) : isOwner ? (
        <>
          <div className="word-display" style={{ filter: "blur(8px)", userSelect: "none" }}>• • • • •</div>
          <p className="muted-note">Your word is being described — stay neutral!</p>
          <ReactionBar onReact={sendReaction} />
        </>
      ) : (
        <>
          <div className="word-display" style={{ letterSpacing: "0.3em", color: "var(--muted)" }}>? ? ? ? ?</div>
          <p className="muted-note"><strong>{currentRound.describerName}</strong> is describing. Shout it out!</p>
          <ReactionBar onReact={sendReaction} />
        </>
      )}
    </div>
  );

  if (phase === "guess-owner" && currentRound) {
    return (
      <div className="screen">
        <div className="phase-tag">Whose word is it?</div>
        {currentRound.wordGuessed
          ? <div className="badge-success" style={{ marginBottom: "1rem" }}>Word guessed — now find the owner!</div>
          : <div className="badge-warning" style={{ marginBottom: "1rem" }}>Word not guessed — but who wrote it?</div>}
        <div className="word-display">{currentRound.word}</div>

        {isOwner ? (
          <>
            <p className="muted-note" style={{ marginBottom: "1rem" }}>Everyone is guessing your word — stay poker-faced!</p>
            <VoteTally votes={votes} playerList={playerList} ownerName={currentRound.ownerName} eligibleVoters={eligibleVoters} />
          </>
        ) : (
          <>
            <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
              {currentRound.ownerName} sits out. Who wrote <em>{currentRound.word}</em>?
            </p>
            <VoteTally votes={votes} playerList={playerList} ownerName={currentRound.ownerName} eligibleVoters={eligibleVoters} />
            {!voteConfirmed ? (
              <>
                {/* FIX: vote chips now show emoji avatars */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1.5rem" }}>
                  {playerList.map(p => (
                    <button key={p.id}
                      className={`player-chip ${myVote?.id === p.id ? "selected" : ""}`}
                      onClick={() => setMyVote(p)}>
                      {p.emoji && <span style={{ marginRight: 4 }}>{p.emoji}</span>}{p.name}
                    </button>
                  ))}
                </div>
                <button className="btn-primary" onClick={confirmMyVote} disabled={!myVote}>
                  Lock in my vote
                </button>
              </>
            ) : (
              <div className="badge-success" style={{ marginBottom: "1rem" }}>
                Your vote is in! Waiting for others...
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (phase === "reveal" && currentRound) {
    const tally = {};
    Object.values(votes).forEach(v => { tally[v.name] = (tally[v.name] || 0) + 1; });
    const sortedTally = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const ownerEntry = playerList.find(p => p.name === currentRound.ownerName);
    return (
      <div className="screen">
        {showFlash && <FlashOverlay />}
        <div className="phase-tag">Reveal</div>
        <div className="word-display word-slam" key="reveal-word">{currentRound.word}</div>

        <div className="reveal-card" style={{ paddingTop: "1.5rem", paddingBottom: "1.5rem" }}>
          <p className="reveal-label" style={{ marginBottom: 16 }}>This word belongs to</p>
          <SilhouetteReveal
            name={currentRound.ownerName}
            emoji={ownerEntry?.emoji}
            revealed={ownerRevealed}
          />
        </div>

        {scorePopName && (
          <div className="score-pop" style={{
            textAlign: "center", fontSize: 22, fontWeight: 700,
            color: "var(--success-text)", marginBottom: "0.75rem"
          }}>
            +1 to {scorePopName}!
          </div>
        )}

        {ownerRevealed && sortedTally.length > 0 && (
          <div className="card" style={{ marginBottom: "1rem", animation: "scorePop 0.4s ease-out" }}>
            <label>How everyone voted</label>
            {sortedTally.map(([name, count]) => {
              const entry = playerList.find(p => p.name === name);
              return (
                <div key={name} className="player-row">
                  <Avatar name={name} emoji={entry?.emoji} size={28} />
                  <span style={{ flex: 1 }}>{name}</span>
                  <span style={{ fontSize: 13, color: name === currentRound.ownerName ? "var(--success-text)" : "var(--muted)" }}>
                    {count} vote{count !== 1 ? "s" : ""}{name === currentRound.ownerName ? " ✓" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {ownerRevealed && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
            {currentRound.wordGuessed
              ? <div className="badge-success">Word guessed correctly</div>
              : <div className="badge-neutral">Word not guessed this round</div>}
            {currentRound.tie
              ? <div className="badge-warning">It's a tie — no points awarded</div>
              : currentRound.ownerGuessCorrect
              ? <div className="badge-success">Most votes correctly identified {currentRound.ownerName}!</div>
              : <div className="badge-warning">Majority voted {currentRound.ownerGuessName || "—"} — it was {currentRound.ownerName}</div>}
          </div>
        )}

        {/* FIX: host buttons only appear after reveal so they can't skip it */}
        {ownerRevealed && isHost && (
          <>
            <button className="btn-primary" onClick={startElaborate}>Start 1-min elaboration</button>
            <button className="btn-secondary" onClick={nextRound} style={{ marginTop: 8 }}>Skip elaboration</button>
          </>
        )}
        {ownerRevealed && !isHost && (
          <p className="muted-note">Waiting for <strong>{game?.hostName}</strong>...</p>
        )}
      </div>
    );
  }

  if (phase === "elaborate" && currentRound) return (
    <div className="screen">
      <div className="phase-tag">Elaboration</div>
      <TimerRing seconds={timer} total={timerTotal} />
      <div className="word-display">{currentRound.word}</div>
      <p className="muted-note" style={{ marginBottom: "1.5rem" }}>
        <strong>{currentRound.ownerName}</strong> — tell us the story behind this word!
      </p>
      {isHost
        ? <button className="btn-primary" onClick={nextRound}>Next round</button>
        : <p className="muted-note">Waiting for <strong>{game?.hostName}</strong> to move on...</p>}
    </div>
  );

  if (phase === "scoreboard") {
    const sorted = [...playerList].sort((a, b) => (b.score || 0) - (a.score || 0));
    return (
      <div className="screen">
        {showConfetti && <Confetti />}
        <div className="logo">that's a wrap!</div>
        <p className="subtitle" style={{ marginBottom: "1.5rem" }}>Final scores</p>
        <div className="card" style={{ marginBottom: "1rem" }}>
          {sorted.map((p, i) => (
            <div key={p.id} className="score-row">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="rank">{i + 1}</span>
                <Avatar name={p.name} emoji={p.emoji} />
                <span>{p.name}</span>
                {i === 0 && <span className="badge-success">winner</span>}
              </div>
              <span className="score-num">{p.score || 0} pt{p.score !== 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
        {isHost
          ? <button className="btn-primary" onClick={resetGame}>Play again</button>
          : <p className="muted-note">Waiting for <strong>{game?.hostName}</strong> to start a new game...</p>}
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="logo">30s words</div>
      <p className="muted-note">Connecting...</p>
    </div>
  );
}
