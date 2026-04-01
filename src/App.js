import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, set, onValue, update, get, runTransaction } from "firebase/database";
import "./App.css";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// Firebase converts arrays to objects with numeric keys — this converts them back
function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.keys(val).sort((a, b) => Number(a) - Number(b)).map(k => val[k]);
}

function getMyId() {
  let id = localStorage.getItem("wordgame_myid");
  if (!id) {
    id = Math.random().toString(36).substring(2, 10);
    localStorage.setItem("wordgame_myid", id);
  }
  return id;
}

function clearSession() {
  localStorage.removeItem("wordgame_code");
  localStorage.removeItem("wordgame_name");
}

// Move words owned by the describer to the bottom of the pile
function filterPileForDescriber(pile, describerName) {
  const describable = pile.filter(w => w.ownerName !== describerName);
  const ownWords = pile.filter(w => w.ownerName === describerName);
  return [...describable, ...ownWords];
}

const AVATAR_EMOJIS = [
  "🐶","🦊","🐸","🐙","🦁","🐼","🦄","🐯","🦀",
  "🐳","🦜","🐝","🦔","🐲","🦩","🐠","🦭","🐨","🦋","🐻"
];

const REACTION_EMOJIS = ["😂", "🔥", "😮", "👏", "💀"];

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function SilhouetteReveal({ name, emoji, revealed }) {
  const colors = ["#C8B8F5","#9FE1CB","#F5C4B3","#B5D4F4","#FAC775","#F4C0D1"];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  return (
    <div style={{ textAlign: "center", marginBottom: "0.5rem" }}>
      <div style={{ position: "relative", width: 90, height: 90, margin: "0 auto 0.75rem" }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: colors[idx], opacity: revealed ? 1 : 0,
          transition: "opacity 0.4s ease",
          animation: revealed ? "silhouetteFlip 0.5s ease-in-out" : "none"
        }} />
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "#1A1916", opacity: revealed ? 0 : 1,
          transition: "opacity 0.4s ease"
        }} />
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
      pointerEvents: "none", zIndex: 100, display: "flex", justifyContent: "center"
    }}>
      {reactions.map(r => (
        <span key={r.id} style={{
          position: "absolute", fontSize: 32, left: `${r.x}%`,
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
          left: `${p.x}%`, top: -20, width: p.size, height: p.size,
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

// ─── Session ──────────────────────────────────────────────────────────────────

// Clear any stale session on load — reconnect on refresh is removed for simplicity
clearSession();

// ─── Main App ─────────────────────────────────────────────────────────────────

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
  const [floatingReactions, setFloatingReactions] = useState([]);
  const seenReactionsRef = useRef(new Set());
  const [countdown, setCountdown] = useState(null);
  const [showFlash, setShowFlash] = useState(false);
  const [ownerRevealed, setOwnerRevealed] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [scorePopNames, setScorePopNames] = useState([]);
  const countdownRef = useRef(null);
  const revealTriggeredRef = useRef(false);
  const timeUpFiredRef = useRef(false);
  const nextRevealFiredRef = useRef(false);

  // ── Derived state ─────────────────────────────────────────────────────────

  const phase = game?.phase;
  const players = game?.players || {};
  const playerList = Object.entries(players).map(([id, p]) => ({ id, ...p }));
  const isHost = game?.hostId === myId;
  const myPlayer = players[myId];
  const myName = myPlayer?.name || playerName;
  const myEmoji = myPlayer?.emoji || "";

  // New structure: pile, currentWord, revealQueue, describerName
  const pile = toArray(game?.pile);
  const currentWord = game?.currentWord || null;
  const revealQueue = toArray(game?.revealQueue);
  const currentReveal = game?.currentReveal || null;
  const describerName = game?.describerName || "";

  const isDescriber = describerName === myName;
  const isOwner = currentReveal?.ownerName === myName && !!myPlayer;

  const votes = currentReveal?.votes || {};
  const voteCount = Object.keys(votes).length;
  const eligibleVoters = playerList.filter(p => p.name !== currentReveal?.ownerName);
  const allVoted = eligibleVoters.length > 0 && voteCount >= eligibleVoters.length;

  const takenEmojis = new Set(playerList.filter(p => p.id !== myId && p.emoji).map(p => p.emoji));
  const availableEmojis = AVATAR_EMOJIS.filter(e => !takenEmojis.has(e));

  // ── Firebase listener ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!gameCode) return;
    const r = ref(db, `games/${gameCode}`);
    const unsub = onValue(r, snap => {
      const data = snap.val();
      if (!data) return;
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

  // ── Timer tick ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!game?.timerStart) return;
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - game.timerStart) / 1000);
      setTimer(Math.max(0, game.timerDuration - elapsed));
    }, 500);
    return () => clearInterval(timerRef.current);
  }, [game?.timerStart, game?.timerDuration]);

  // ── Reaction listener ─────────────────────────────────────────────────────

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
        setTimeout(() => setFloatingReactions(prev => prev.filter(r => r.id !== floatId)), 1800);
      });
    });
    return () => unsub();
  }, [gameCode]);

  async function sendReaction(emoji) {
    const reactionId = `${myId}_${Date.now()}`;
    await set(ref(db, `games/${gameCode}/reactions/${reactionId}`), { emoji, ts: Date.now(), senderId: myId });
    setTimeout(() => set(ref(db, `games/${gameCode}/reactions/${reactionId}`), null), 3000);
  }

  // ── Countdown — fires for ALL players when phase is "countdown" ──────────

  useEffect(() => {
    if (phase !== "countdown") {
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; setCountdown(null); }
      timeUpFiredRef.current = false;
      return;
    }
    if (countdownRef.current) return;
    setCountdown(3);
    let n = 3;
    countdownRef.current = setInterval(() => {
      n--;
      if (n < 0) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
        setCountdown(null);
        // Host kicks off the actual 30s timer after countdown
        if (isHost) {
          update(ref(db, `games/${gameCode}`), {
            phase: "describe", timerStart: Date.now(), timerDuration: 30
          });
        }
      } else {
        setCountdown(n);
      }
    }, 900);
    return () => { clearInterval(countdownRef.current); countdownRef.current = null; };
  }, [phase, isHost, gameCode]);

  useEffect(() => {
    if (phase !== "describe") timeUpFiredRef.current = false;
  }, [phase]);

  useEffect(() => {
    if (phase !== "reveal-show") { setOwnerRevealed(false); setShowFlash(false); setScorePopNames([]); revealTriggeredRef.current = false; nextRevealFiredRef.current = false; return; }
    setShowFlash(true);
    setTimeout(() => setShowFlash(false), 600);
    setTimeout(() => setOwnerRevealed(true), 800);
  }, [phase, currentReveal?.word]);

  useEffect(() => {
    if (!ownerRevealed || !currentReveal) return;
    const correctVoterNames = Object.values(currentReveal.votes || {})
      .filter(v => v.name === currentReveal.ownerName)
      .map(v => {
        const p = playerList.find(pl => pl.id === v.voterId);
        return p?.name || v.name;
      });
    setScorePopNames(correctVoterNames);
  }, [ownerRevealed, currentReveal]);

  // ── Confetti ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "scoreboard") return;
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  }, [phase]);

  // ── Auto-reveal when all votes in ─────────────────────────────────────────

  useEffect(() => {
    if (!allVoted || phase !== "reveal-vote" || !isHost) return;
    if (revealTriggeredRef.current) return;
    revealTriggeredRef.current = true;

    const tally = {};
    Object.values(votes).forEach(v => { tally[v.name] = (tally[v.name] || 0) + 1; });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const topCount = sorted[0]?.[1] ?? 0;
    const isTie = sorted.length > 1 && sorted[1][1] === topCount;
    const topName = sorted[0]?.[0];

    const correctVoters = Object.values(votes).filter(v => v.name === currentReveal.ownerName);

    const updates = {};
    updates[`games/${gameCode}/currentReveal/ownerGuessCorrect`] = correctVoters.length > 0;
    updates[`games/${gameCode}/currentReveal/ownerGuessName`] = isTie ? null : topName;
    updates[`games/${gameCode}/currentReveal/tie`] = isTie;
    updates[`games/${gameCode}/phase`] = "reveal-show";
    update(ref(db), updates);

    // Award +3 to correct voters
    correctVoters.forEach(v => {
      runTransaction(ref(db, `games/${gameCode}/players/${v.voterId}/score`), s => (s || 0) + 3);
    });

    // Award +2 to describer and +1 to all guessers (excl owner) if word was guessed
    if (currentReveal.wordGuessed) {
      const describerEntry = playerList.find(p => p.name === describerName);
      if (describerEntry) {
        runTransaction(ref(db, `games/${gameCode}/players/${describerEntry.id}/score`), s => (s || 0) + 2);
      }
      playerList.forEach(p => {
        if (p.name !== currentReveal.ownerName && p.name !== describerName) {
          runTransaction(ref(db, `games/${gameCode}/players/${p.id}/score`), s => (s || 0) + 1);
        }
      });
    }
  }, [allVoted, phase, isHost]);

  // ── Reset vote state when currentReveal changes ───────────────────────────

  useEffect(() => {
    setMyVote(null);
    setVoteConfirmed(false);
    revealTriggeredRef.current = false;
  }, [currentReveal?.word]);

  // ── Vibrate describer on pregame ──────────────────────────────────────────

  useEffect(() => {
    if (phase === "pregame" && isDescriber && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  }, [phase, isDescriber]);

  // ── Actions ───────────────────────────────────────────────────────────────

  async function createGame() {
    if (!playerName.trim()) { setError("Enter your name first."); return; }
    const code = randomCode();
    await set(ref(db, `games/${code}`), {
      hostId: myId, hostName: playerName.trim(), status: "lobby",
      players: { [myId]: { name: playerName.trim(), emoji: "", ready: false, score: 0 } },
      pile: null, currentWord: null, revealQueue: null, currentReveal: null,
      describerName: "", describerIdx: 0,
      phase: "lobby", timerStart: null, timerDuration: null
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
    await update(ref(db, `games/${code}/players/${myId}`), { name: playerName.trim(), emoji: "", ready: false, score: 0 });
    setGameCode(code);
    setScreen("lobby");
  }

  async function pickEmoji(emoji) {
    if (takenEmojis.has(emoji)) return;
    await update(ref(db, `games/${gameCode}/players/${myId}`), { emoji });
  }

  async function submitWords() {
    if (!myEmoji) { setError("Pick an avatar first!"); return; }
    const filled = words.filter(w => w.trim());
    if (filled.length < 2) { setError("Add at least 2 words."); return; }
    await update(ref(db, `games/${gameCode}/players/${myId}`), { words: filled.map(w => w.trim()), ready: true });
    setError(""); setEditingWords(false);
  }

  async function startGame() {
    const ids = Object.keys(players);
    if (ids.length < 2) { setError("Need at least 2 players."); return; }
    const notReady = ids.filter(id => !players[id].ready);
    if (notReady.length > 0) { setError(`Still waiting for: ${notReady.map(id => players[id].name).join(", ")}`); return; }

    let pile = [];
    ids.forEach(id => {
      (players[id].words || []).forEach(w => {
        pile.push({ word: w, ownerName: players[id].name, ownerId: id });
      });
    });
    pile = shuffle(pile);

    // Pick first describer — rotate to first player who doesn't own the first word
    const names = ids.map(id => players[id].name);
    const firstDescriber = names.find(n => n !== pile[0].ownerName) || names[0];

    // Push describer's own words to the bottom so they never see them during their turn
    pile = filterPileForDescriber(pile, firstDescriber);

    await update(ref(db, `games/${gameCode}`), {
      pile: pile.slice(1),
      currentWord: pile[0],
      revealQueue: [],
      currentReveal: null,
      describerName: firstDescriber,
      describerIdx: 0,
      status: "playing",
      phase: "pregame",
      timerStart: null, timerDuration: null
    });
  }

  async function beginDescribe() {
    await update(ref(db, `games/${gameCode}`), {
      phase: "countdown"
    });
  }

  async function wordGuessed() {
    const newRevealQueue = [...revealQueue, { ...currentWord, wordGuessed: true, votes: {} }];

    // Filter pile so describer never sees their own words
    const availablePile = filterPileForDescriber(pile, describerName);

    if (availablePile.length === 0) {
      await update(ref(db, `games/${gameCode}`), {
        currentWord: null,
        phase: "reveal-vote",
        currentReveal: newRevealQueue[0],
        revealQueue: newRevealQueue.slice(1),
        timerStart: null, timerDuration: null
      });
    } else {
      await update(ref(db, `games/${gameCode}`), {
        revealQueue: newRevealQueue,
        currentWord: availablePile[0],
        pile: availablePile.slice(1),
        phase: "describe"
      });
    }
  }

  async function timeUp() {
    if (timeUpFiredRef.current) return;
    timeUpFiredRef.current = true;
    // Current word was not guessed — add to reveal queue
    const notGuessedWord = { ...currentWord, wordGuessed: false, votes: {} };
    const newRevealQueue = [...revealQueue, notGuessedWord];
    await update(ref(db, `games/${gameCode}`), {
      revealQueue: newRevealQueue.slice(1),
      currentReveal: newRevealQueue[0],
      currentWord: null,
      phase: "reveal-vote",
      timerStart: null, timerDuration: null
    });
  }

  async function timeUpNoWords() {
    if (pile.length === 0) {
      await update(ref(db, `games/${gameCode}`), { phase: "scoreboard", status: "done" });
      return;
    }
    await advanceDescriber(pile);
  }

  async function castVote(player) {
    if (isOwner || voteConfirmed) return;
    setMyVote(player);
    setVoteConfirmed(true);
    await update(ref(db, `games/${gameCode}/currentReveal/votes/${myId}`), { name: player.name, voterId: myId });
  }

  // After elaboration — anyone can move to next word
  async function nextReveal() {
    if (nextRevealFiredRef.current) return;
    nextRevealFiredRef.current = true;
    if (revealQueue.length > 0) {
      await update(ref(db, `games/${gameCode}`), {
        currentReveal: revealQueue[0],
        revealQueue: revealQueue.slice(1),
        phase: "reveal-vote"
      });
    } else {
      await advanceDescriber(pile);
    }
  }

  async function advanceDescriber(remainingPile) {
    if (remainingPile.length === 0) {
      await update(ref(db, `games/${gameCode}`), { phase: "scoreboard", status: "done", currentReveal: null });
      return;
    }

    // Pick next describer — rotate through player names
    const names = playerList.map(p => p.name);
    const currentDescriberIdx = game?.describerIdx || 0;
    let nextIdx = (currentDescriberIdx + 1) % names.length;
    const nextDescriber = names[nextIdx];

    // Push next describer's own words to the bottom of the pile
    const reorderedPile = filterPileForDescriber(remainingPile, nextDescriber);

    await update(ref(db, `games/${gameCode}`), {
      pile: reorderedPile.slice(1),
      currentWord: reorderedPile[0],
      revealQueue: [],
      currentReveal: null,
      describerName: nextDescriber,
      describerIdx: nextIdx,
      phase: "pregame",
      timerStart: null, timerDuration: null
    });
  }

  async function resetGame() {
    const updates = {};
    Object.keys(players).forEach(id => {
      updates[`games/${gameCode}/players/${id}/score`] = 0;
      updates[`games/${gameCode}/players/${id}/ready`] = false;
      updates[`games/${gameCode}/players/${id}/words`] = null;
    });
    updates[`games/${gameCode}/pile`] = null;
    updates[`games/${gameCode}/currentWord`] = null;
    updates[`games/${gameCode}/revealQueue`] = null;
    updates[`games/${gameCode}/currentReveal`] = null;
    updates[`games/${gameCode}/describerName`] = "";
    updates[`games/${gameCode}/status`] = "lobby";
    updates[`games/${gameCode}/phase`] = "lobby";
    updates[`games/${gameCode}/timerStart`] = null;
    updates[`games/${gameCode}/timerDuration`] = null;
    await update(ref(db), updates);
    setWords(["", "", ""]);
    setEditingWords(false);
  }

  // ── Screens ───────────────────────────────────────────────────────────────

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
      <div className="phase-tag">Game code</div>
      <div className="game-code">{gameCode}</div>
      <p className="subtitle" style={{ marginBottom: "2rem" }}>Share this code — everyone joins on their own phone</p>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <label>Pick your avatar {myEmoji && <span style={{ marginLeft: 8, fontSize: 20 }}>{myEmoji}</span>}</label>
        {availableEmojis.length === 0
          ? <p style={{ color: "var(--muted)", fontSize: 14 }}>All avatars are taken!</p>
          : <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {availableEmojis.map((e, i) => (
                <button key={i} onClick={() => pickEmoji(e)} style={{
                  fontSize: 26, background: myEmoji === e ? "var(--text)" : "var(--bg)",
                  border: `1.5px solid ${myEmoji === e ? "var(--text)" : "var(--border)"}`,
                  borderRadius: 12, width: 46, height: 46, cursor: "pointer",
                  transition: "all 0.15s", transform: myEmoji === e ? "scale(1.15)" : "scale(1)"
                }}>{e}</button>
              ))}
            </div>
        }
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

      {isHost
        ? <button className="btn-primary" onClick={startGame} style={{ marginTop: "1rem" }}>Start game →</button>
        : <p className="muted-note">Waiting for <strong>{game?.hostName}</strong> to start...</p>}
      <button className="btn-secondary" onClick={() => { clearSession(); setGameCode(""); setPlayerName(""); setScreen("home"); }} style={{ marginTop: 8 }}>
        Leave game
      </button>
      {error && <p className="error" style={{ marginTop: 8, textAlign: "center" }}>{error}</p>}
    </div>
  );

  if (phase === "pregame" && currentWord) return (
    <div className="screen">
      <div className="phase-tag">Up next</div>
      <div className="screen-title">
        {isDescriber ? "Your turn!" : "Get ready"}
      </div>

      {isDescriber && (
        <div className="highlight-card describer">
          <div className="highlight-label">You're describing</div>
          <p>You have 30 seconds. Get as many words as you can — say the word and move on!</p>
        </div>
      )}
      {!isDescriber && (
        <div className="highlight-card neutral">
          <div className="highlight-label"><strong>{describerName}</strong> is up</div>
          <p>Shout the word as soon as you know it!</p>
        </div>
      )}

      {isHost
        ? <button className="btn-primary" onClick={beginDescribe} style={{ marginTop: "1.5rem" }}>
            Start 30 seconds →
          </button>
        : <p className="muted-note">Waiting for <strong>{game?.hostName}</strong> to start...</p>}
    </div>
  );

  // Countdown phase — shown to everyone before describing starts
  if (phase === "countdown") return (
    <div className="screen">
      {countdown !== null && <CountdownSplash number={countdown} />}
      <FloatingReactions reactions={floatingReactions} />
      <div className="phase-tag">Get ready</div>
      <div className="screen-title">{isDescriber ? "You're up!" : `${describerName} is describing`}</div>
    </div>
  );

  if (phase === "describe" && currentWord) return (
    <div className="screen" style={{ animation: timer <= 10 && timer > 0 ? "panicPulse 0.6s ease-in-out infinite" : "none" }}>
      <FloatingReactions reactions={floatingReactions} />
      <div className="phase-tag">Describe</div>
      <TimerRing seconds={timer} total={timerTotal} />

      {isDescriber ? (
        <>
          <div className="word-display word-slam" key={currentWord.word}>{currentWord.word}</div>
          <p className="muted-note" style={{ marginBottom: "1.5rem" }}>No saying the word or spelling it out!</p>
          <button className="btn-primary" onClick={wordGuessed}>Word guessed! →</button>
          {timer === 0 && (
            <button className="btn-secondary" onClick={timeUp} style={{ marginTop: 8, color: "#E24B4A", borderColor: "#E24B4A" }}>
              Time's up — end round
            </button>
          )}
        </>
      ) : (
        <>
          <div className="word-display" style={{ letterSpacing: "0.3em", color: "var(--muted)" }}>? ? ? ? ?</div>
          <p className="muted-note"><strong>{describerName}</strong> is describing. Shout it out!</p>
          <ReactionBar onReact={sendReaction} />
          {timer === 0 && isHost && (
            <button className="btn-secondary" onClick={timeUp} style={{ marginTop: "1rem" }}>
              Move on (time's up)
            </button>
          )}
        </>
      )}
    </div>
  );

  // Timer ran out with nothing played at all
  if (phase === "describe" && !currentWord) return (
    <div className="screen">
      <div className="phase-tag">Describe</div>
      <div className="screen-title">Round over</div>
      <p className="muted-note" style={{ marginBottom: "1.5rem" }}>No words were played this round.</p>
      {isHost && <button className="btn-primary" onClick={() => timeUpNoWords()}>Next round</button>}
      {!isHost && <p className="muted-note">Waiting for <strong>{game?.hostName}</strong>...</p>}
    </div>
  );

  if (phase === "reveal-vote" && currentReveal) {
    const guessablePlayers = playerList;
    const remainingCount = revealQueue.length;
    return (
      <div className="screen">
        <div className="phase-tag">Reveal {remainingCount > 0 ? `· ${remainingCount + 1} left` : ""}</div>
        <div className="screen-title">Whose word is this?</div>
        <div className="word-display">{currentReveal.word}</div>
        {!currentReveal.wordGuessed && (
          <div className="badge-warning" style={{ marginBottom: "1rem" }}>Word wasn't guessed this round</div>
        )}

        {isOwner ? (
          <>
            <p className="muted-note" style={{ marginBottom: "1rem" }}>Everyone is guessing your word — stay poker-faced!</p>
            <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
              {voteCount} of {eligibleVoters.length} voted
            </div>
          </>
        ) : (
          <>
            <p style={{ marginBottom: "1.25rem", color: "var(--muted)", fontSize: 15 }}>
              Tap a name to vote
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: "1rem" }}>
              {guessablePlayers.map(p => (
                <button key={p.id}
                  className={`player-chip ${myVote?.id === p.id ? "selected" : ""}`}
                  onClick={() => castVote(p)}
                  disabled={voteConfirmed}
                  style={{ fontSize: 15, padding: "10px 18px", opacity: voteConfirmed && myVote?.id !== p.id ? 0.4 : 1 }}>
                  {p.emoji && <span style={{ marginRight: 6, fontSize: 18 }}>{p.emoji}</span>}{p.name}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: "1rem" }}>
              {voteConfirmed
                ? `Your vote is in! ${voteCount} of ${eligibleVoters.length} voted`
                : `${voteCount} of ${eligibleVoters.length} voted`}
            </div>
          </>
        )}
      </div>
    );
  }

  if (phase === "reveal-show" && currentReveal) {
    const tally = {};
    Object.values(votes).forEach(v => { tally[v.name] = (tally[v.name] || 0) + 1; });
    const sortedTally = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const ownerEntry = playerList.find(p => p.name === currentReveal.ownerName);
    const remainingCount = revealQueue.length;
    return (
      <div className="screen">
        {showFlash && <FlashOverlay />}
        <div className="phase-tag">Reveal {remainingCount > 0 ? `· ${remainingCount} more after this` : "· last one"}</div>
        <div className="screen-title">The reveal</div>

        <div className="reveal-card" style={{ paddingTop: "2rem", paddingBottom: "2rem", marginBottom: "1rem" }}>
          <SilhouetteReveal name={currentReveal.ownerName} emoji={ownerEntry?.emoji} revealed={ownerRevealed} />
          <p style={{ textAlign: "center", fontSize: 14, color: "var(--muted)", marginTop: 8 }}>
            wrote <strong style={{ color: "var(--text)" }}>{currentReveal.word}</strong>
          </p>
        </div>

        {scorePopNames.length > 0 && (
          <div className="score-pop" style={{ textAlign: "center", fontSize: 18, fontWeight: 700, color: "var(--success-text)", marginBottom: "0.75rem" }}>
            +3 to {scorePopNames.join(", ")}!
          </div>
        )}

        {ownerRevealed && sortedTally.length > 0 && (
          <div className="card" style={{ marginBottom: "1rem" }}>
            <label>How everyone voted</label>
            {sortedTally.map(([name, count]) => {
              const entry = playerList.find(p => p.name === name);
              return (
                <div key={name} className="player-row">
                  <Avatar name={name} emoji={entry?.emoji} size={28} />
                  <span style={{ flex: 1 }}>{name}</span>
                  <span style={{ fontSize: 13, color: name === currentReveal.ownerName ? "var(--success-text)" : "var(--muted)" }}>
                    {count} vote{count !== 1 ? "s" : ""}{name === currentReveal.ownerName ? " ✓" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {ownerRevealed && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
            {currentReveal.wordGuessed
              ? <div className="badge-success">Word guessed — +2 to {describerName}, +1 to guessers</div>
              : <div className="badge-neutral">Word not guessed this round</div>}
            {currentReveal.tie
              ? currentReveal.ownerGuessCorrect
                ? <div className="badge-success">It's a tie — +3 to everyone who got it right!</div>
                : <div className="badge-warning">It's a tie — nobody identified {currentReveal.ownerName}</div>
              : currentReveal.ownerGuessCorrect
              ? <div className="badge-success">Owner correctly identified! +3 points</div>
              : <div className="badge-warning">Wrong guess — it was {currentReveal.ownerName}</div>}
          </div>
        )}

        {/* Elaboration — no timer, host clicks next when done */}
        {ownerRevealed && (
          <div className="highlight-card neutral" style={{ marginBottom: "1rem" }}>
            <div className="highlight-label">{currentReveal.ownerName}'s turn to elaborate</div>
            <p>Tell us the story behind <strong>{currentReveal.word}</strong>!</p>
          </div>
        )}

        {ownerRevealed && isOwner && (
          <button className="btn-primary" onClick={nextReveal}>
            {remainingCount > 0 ? "Next word →" : "End round →"}
          </button>
        )}
        {ownerRevealed && !isOwner && (
          <p className="muted-note">Waiting for <strong>{currentReveal.ownerName}</strong> to move on...</p>
        )}
      </div>
    );
  }

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
        <button className="btn-secondary" onClick={() => { clearSession(); setGameCode(""); setPlayerName(""); setScreen("home"); }} style={{ marginTop: 8 }}>
          Leave game
        </button>
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
