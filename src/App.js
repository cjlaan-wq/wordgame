import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import { ref, set, onValue, update, get } from "firebase/database";
import "./App.css";

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

function Avatar({ name, size = 36 }) {
  const colors = ["#C8B8F5","#9FE1CB","#F5C4B3","#B5D4F4","#FAC775","#F4C0D1"];
  const idx = name ? name.charCodeAt(0) % colors.length : 0;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: colors[idx],
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 600, color: "#2C2C2A", flexShrink: 0
    }}>
      {name ? name[0].toUpperCase() : "?"}
    </div>
  );
}

function TimerRing({ seconds, total, size = 120 }) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const pct = seconds / total;
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
      }}>{seconds}</div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [gameCode, setGameCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [myId] = useState(() => Math.random().toString(36).substring(2, 10));
  const [game, setGame] = useState(null);
  const [words, setWords] = useState(["", "", ""]);
  const [selectedGuess, setSelectedGuess] = useState(null);
  const [timer, setTimer] = useState(0);
  const [timerTotal, setTimerTotal] = useState(30);
  const [error, setError] = useState("");
  const timerRef = useRef(null);
  const gameRef = useRef(null);

  const isHost = game && game.hostId === myId;
  const myPlayer = game && game.players && game.players[myId];
  const currentRound = game && game.rounds && game.currentRoundIdx >= 0
    ? game.rounds[game.currentRoundIdx] : null;
  const isDescriber = currentRound && currentRound.describerId === myId;
  const isOwner = currentRound && currentRound.ownerId === myId;

  useEffect(() => {
    if (!gameCode) return;
    const r = ref(db, `games/${gameCode}`);
    gameRef.current = r;
    const unsub = onValue(r, snap => {
      const data = snap.val();
      if (!data) return;
      setGame(data);
      if (data.timerStart && data.timerDuration) {
        const elapsed = Math.floor((Date.now() - data.timerStart) / 1000);
        const remaining = Math.max(0, data.timerDuration - elapsed);
        setTimer(remaining);
        setTimerTotal(data.timerDuration);
      }
    });
    return () => unsub();
  }, [gameCode]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!game || !game.timerStart) return;
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - game.timerStart) / 1000);
      const remaining = Math.max(0, game.timerDuration - elapsed);
      setTimer(remaining);
      if (remaining <= 0) clearInterval(timerRef.current);
    }, 500);
    return () => clearInterval(timerRef.current);
  }, [game?.timerStart, game?.timerDuration]);

  async function createGame() {
    if (!playerName.trim()) { setError("Enter your name first."); return; }
    const code = randomCode();
    const gameData = {
      hostId: myId,
      status: "lobby",
      players: {
        [myId]: { name: playerName.trim(), ready: false, score: 0 }
      },
      rounds: null,
      currentRoundIdx: -1,
      phase: "lobby"
    };
    await set(ref(db, `games/${code}`), gameData);
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
    await update(ref(db, `games/${code}/players/${myId}`), {
      name: playerName.trim(), ready: false, score: 0
    });
    setGameCode(code);
    setScreen("lobby");
  }

  async function submitWords() {
    const filled = words.filter(w => w.trim());
    if (filled.length < 2) { setError("Add at least 2 words."); return; }
    await update(ref(db, `games/${gameCode}/players/${myId}`), {
      words: filled.map(w => w.trim()), ready: true
    });
    setError("");
  }

  async function startGame() {
    const players = game.players;
    const ids = Object.keys(players);
    if (ids.length < 2) { setError("Need at least 2 players."); return; }
    const notReady = ids.filter(id => !players[id].ready);
    if (notReady.length > 0) { setError("Some players haven't submitted their words yet."); return; }

    let allWords = [];
    ids.forEach(id => {
      (players[id].words || []).forEach(w => {
        allWords.push({ word: w, ownerId: id, ownerName: players[id].name });
      });
    });
    allWords = shuffle(allWords);

    const rounds = allWords.map((w, i) => {
      const available = ids.filter(id => id !== w.ownerId);
      const describerId = available[i % available.length];
      return {
        word: w.word,
        ownerId: w.ownerId,
        ownerName: w.ownerName,
        describerId,
        describerName: players[describerId].name,
        wordGuessed: false,
        ownerGuess: null,
        ownerGuessName: null,
        ownerGuessCorrect: false,
        skipped: false
      };
    });

    await update(ref(db, `games/${gameCode}`), {
      rounds,
      currentRoundIdx: 0,
      status: "playing",
      phase: "pregame",
      timerStart: null,
      timerDuration: null
    });
  }

  async function beginDescribe() {
    await update(ref(db, `games/${gameCode}`), {
      phase: "describe",
      timerStart: Date.now(),
      timerDuration: 30
    });
  }

  async function wordGuessed() {
    const idx = game.currentRoundIdx;
    await update(ref(db, `games/${gameCode}/rounds/${idx}`), { wordGuessed: true });
    await update(ref(db, `games/${gameCode}`), {
      phase: "guess-owner",
      timerStart: null,
      timerDuration: null
    });
  }

  async function skipWord() {
    const idx = game.currentRoundIdx;
    await update(ref(db, `games/${gameCode}/rounds/${idx}`), { skipped: true });
    await update(ref(db, `games/${gameCode}`), {
      phase: "guess-owner",
      timerStart: null,
      timerDuration: null
    });
  }

  async function confirmGuess() {
    if (!selectedGuess) return;
    const idx = game.currentRoundIdx;
    const correct = selectedGuess.id === currentRound.ownerId;
    await update(ref(db, `games/${gameCode}/rounds/${idx}`), {
      ownerGuess: selectedGuess.id,
      ownerGuessName: selectedGuess.name,
      ownerGuessCorrect: correct
    });
    if (correct && currentRound.wordGuessed) {
      const currentScore = game.players[selectedGuess.id]?.score || 0;
      await update(ref(db, `games/${gameCode}/players/${selectedGuess.id}`), {
        score: currentScore + 1
      });
    }
    await update(ref(db, `games/${gameCode}`), { phase: "reveal" });
    setSelectedGuess(null);
  }

  async function startElaborate() {
    await update(ref(db, `games/${gameCode}`), {
      phase: "elaborate",
      timerStart: Date.now(),
      timerDuration: 60
    });
  }

  async function nextRound() {
    const nextIdx = game.currentRoundIdx + 1;
    if (nextIdx >= game.rounds.length) {
      await update(ref(db, `games/${gameCode}`), { phase: "scoreboard", status: "done" });
    } else {
      await update(ref(db, `games/${gameCode}`), {
        currentRoundIdx: nextIdx,
        phase: "pregame",
        timerStart: null,
        timerDuration: null
      });
    }
  }

  const phase = game?.phase;
  const players = game?.players || {};
  const playerList = Object.entries(players).map(([id, p]) => ({ id, ...p }));

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
          placeholder="Game code (e.g. X7KP)" maxLength={4} style={{ letterSpacing: "0.15em", textTransform: "uppercase" }} />
        <button className="btn-secondary" onClick={joinGame}>Join game</button>
      </div>
    </div>
  );

  if (screen === "lobby" && phase === "lobby") return (
    <div className="screen">
      <div className="phase-tag">Lobby</div>
      <div className="game-code">{gameCode}</div>
      <p className="subtitle" style={{ marginBottom: "1.5rem" }}>Share this code with your team</p>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <label>Your words <span style={{ fontWeight: 400, color: "var(--muted)" }}>(2–3, fun &amp; weird encouraged)</span></label>
        {words.map((w, i) => (
          <input key={i} value={w} onChange={e => { const nw = [...words]; nw[i] = e.target.value; setWords(nw); }}
            placeholder={i === 2 ? "Word 3 (optional)" : `Word ${i + 1}`} />
        ))}
        {error && <p className="error">{error}</p>}
        {myPlayer?.ready
          ? <div className="badge-success">Words submitted!</div>
          : <button className="btn-primary" onClick={submitWords}>Submit my words</button>}
      </div>

      <div className="card">
        <label>Players ({playerList.length})</label>
        {playerList.map(p => (
          <div key={p.id} className="player-row">
            <Avatar name={p.name} />
            <span>{p.name} {p.id === myId ? "(you)" : ""}</span>
            <span className={p.ready ? "badge-success" : "badge-waiting"}>
              {p.ready ? "ready" : "typing..."}
            </span>
          </div>
        ))}
      </div>

      {isHost && (
        <button className="btn-primary" onClick={startGame} style={{ marginTop: "1rem" }}>
          Start game
        </button>
      )}
      {!isHost && <p className="muted-note">Waiting for the host to start...</p>}
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
          <p>You'll see the word. Describe it without saying it.</p>
        </div>
      )}
      {isOwner && (
        <div className="highlight-card owner">
          <div className="highlight-label">Your word is up — sit this one out</div>
          <p>Don't react when you see it!</p>
        </div>
      )}
      {!isDescriber && !isOwner && (
        <div className="highlight-card neutral">
          <div className="highlight-label">Get ready to guess</div>
          <p><strong>{currentRound.describerName}</strong> is describing. <strong>{currentRound.ownerName}</strong> sits out.</p>
        </div>
      )}

      {isHost && (
        <button className="btn-primary" onClick={beginDescribe} style={{ marginTop: "1.5rem" }}>
          Show the word to {currentRound.describerName}
        </button>
      )}
      {!isHost && <p className="muted-note">Waiting for host to start the round...</p>}
    </div>
  );

  if (phase === "describe" && currentRound) return (
    <div className="screen">
      <div className="phase-tag">Describe the word</div>
      <TimerRing seconds={timer} total={timerTotal} />

      {isDescriber ? (
        <>
          <div className="word-display">{currentRound.word}</div>
          <p className="muted-note" style={{ marginBottom: "1.5rem" }}>No saying the word, no spelling it out!</p>
          <button className="btn-primary" onClick={wordGuessed}>Word guessed!</button>
          <button className="btn-secondary" onClick={skipWord}>Skip this word</button>
        </>
      ) : isOwner ? (
        <>
          <div className="word-display" style={{ filter: "blur(8px)", userSelect: "none" }}>hidden</div>
          <p className="muted-note">You own this word — sit tight and don't react!</p>
        </>
      ) : (
        <>
          <div className="word-display" style={{ letterSpacing: "0.3em", color: "var(--muted)" }}>
            {"? ? ? ? ?"}
          </div>
          <p className="muted-note"><strong>{currentRound.describerName}</strong> is describing. Shout it out!</p>
        </>
      )}
    </div>
  );

  if (phase === "guess-owner" && currentRound) {
    const guessable = playerList.filter(p => p.id !== currentRound.ownerId);
    return (
      <div className="screen">
        <div className="phase-tag">Whose word is it?</div>
        {currentRound.wordGuessed
          ? <div className="badge-success" style={{ marginBottom: "1rem" }}>Word guessed!</div>
          : <div className="badge-warning" style={{ marginBottom: "1rem" }}>Word not guessed — but still guess the owner</div>}
        <div className="word-display">{currentRound.word}</div>
        <p style={{ marginBottom: "1rem", color: "var(--muted)" }}>
          {isOwner ? "Sit tight — they're guessing your word!" : `${currentRound.ownerName} sits out. Who wrote this?`}
        </p>
        {!isOwner && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1.5rem" }}>
              {guessable.map(p => (
                <button key={p.id}
                  className={`player-chip ${selectedGuess?.id === p.id ? "selected" : ""}`}
                  onClick={() => setSelectedGuess(p)}>
                  {p.name}
                </button>
              ))}
            </div>
            {isHost && (
              <button className="btn-primary" onClick={confirmGuess} disabled={!selectedGuess}>
                Confirm guess
              </button>
            )}
            {!isHost && <p className="muted-note">Vote and wait for the host to confirm.</p>}
          </>
        )}
      </div>
    );
  }

  if (phase === "reveal" && currentRound) return (
    <div className="screen">
      <div className="phase-tag">Reveal</div>
      <div className="word-display">{currentRound.word}</div>
      <div className="reveal-card">
        <p className="reveal-label">This word belongs to</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginTop: 8 }}>
          <Avatar name={currentRound.ownerName} size={44} />
          <span style={{ fontSize: 22, fontWeight: 600 }}>{currentRound.ownerName}</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
        {currentRound.wordGuessed
          ? <div className="badge-success">Word guessed correctly</div>
          : <div className="badge-neutral">Word not guessed</div>}
        {currentRound.ownerGuessCorrect
          ? <div className="badge-success">Owner identified! +1 point to {currentRound.ownerGuessName}</div>
          : <div className="badge-warning">Wrong guess — it was {currentRound.ownerName}</div>}
      </div>
      {isHost && (
        <>
          <button className="btn-primary" onClick={startElaborate}>Start 1-min elaboration</button>
          <button className="btn-secondary" onClick={nextRound} style={{ marginTop: 8 }}>Skip elaboration</button>
        </>
      )}
      {!isHost && <p className="muted-note">Waiting for host...</p>}
    </div>
  );

  if (phase === "elaborate" && currentRound) return (
    <div className="screen">
      <div className="phase-tag">Elaboration</div>
      <TimerRing seconds={timer} total={timerTotal} />
      <div className="word-display">{currentRound.word}</div>
      <p className="muted-note" style={{ marginBottom: "1.5rem" }}>
        <strong>{currentRound.ownerName}</strong> — tell us the story behind this word!
      </p>
      {isHost && (
        <button className="btn-primary" onClick={nextRound}>Next round</button>
      )}
      {!isHost && <p className="muted-note">Waiting for host to move on...</p>}
    </div>
  );

  if (phase === "scoreboard") {
    const sorted = [...playerList].sort((a, b) => (b.score || 0) - (a.score || 0));
    return (
      <div className="screen">
        <div className="logo">that's a wrap!</div>
        <p className="subtitle" style={{ marginBottom: "1.5rem" }}>Final scores</p>
        <div className="card">
          {sorted.map((p, i) => (
            <div key={p.id} className="score-row">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="rank">{i + 1}</span>
                <Avatar name={p.name} />
                <span>{p.name}</span>
                {i === 0 && <span className="badge-success">winner</span>}
              </div>
              <span className="score-num">{p.score || 0} pt{p.score !== 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
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
