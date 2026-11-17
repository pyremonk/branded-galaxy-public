/**
 * NetworkLobby — host/join lobby UI for network multiplayer.
 *
 * Allows one player to host a game (generating a 6-character game code) and
 * others to join by entering that code. Shows the player list with faction
 * assignments and ready status, includes lobby chat, and lets the host start
 * the game once all players are ready.
 *
 * Spec: 050-network-features-spec.md (FR-NF-001, FR-NF-002)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { networkSessionManager } from '../../core/network-session-manager.js';
import { dataBridge } from '../../core/data-bridge.js';
import './NetworkLobby.css';

const FACTION_DISPLAY: Record<string, { name: string; color: string }> = {
  brandAuthority: { name: 'Brand Authority', color: '#58a6ff' },
  union:          { name: 'The Union',        color: '#3fb950' },
  autoforge:      { name: 'The Autoforge',    color: '#f0883e' },
};

/**
 * @param {{
 *   gameConfig: object,
 *   factionDef: object,
 *   playerName: string,
 *   onGameStart: (enrichedConfig: object) => void,
 *   onBack: () => void
 * }} props
 */
export function NetworkLobby({ gameConfig, factionDef, playerName, onGameStart, onBack }: any) {
  const isOffline = dataBridge.offlineMode;

  // Which tab is active: 'host' or 'join'
  const [tab,        setTab]        = useState('host');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<any>(null);

  // Host state
  const [gameCode,   setGameCode]   = useState<any>(null);
  const [inLobby,    setInLobby]    = useState(false);
  const [players,    setPlayers]    = useState<any[]>([]);
  const [readySet,   setReadySet]   = useState(new Set());
  const [isReady,    setIsReady]    = useState(false);

  // Join state
  const [joinCode,   setJoinCode]   = useState('');
  const [joinError,  setJoinError]  = useState<any>(null);

  // Chat state
  const [chatInput,  setChatInput]  = useState('');
  const [messages,   setMessages]   = useState<any[]>([]);
  const chatRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  // Network event listeners
  const addMessage = useCallback((name: any, text: any) => {
    setMessages(prev => [...prev, { name, text, id: Date.now() + Math.random() }]);
  }, []);

  useEffect(() => {
    const onJoined = (e: any) => {
      const { playerId, playerName: pName, factionId } = e.detail ?? {};
      setPlayers(prev => {
        if (prev.some(p => p.playerId === playerId)) return prev;
        return [...prev, { playerId, playerName: pName, factionId, isHost: false, ordinal: prev.length }];
      });
      addMessage('System', `${pName} joined the lobby.`);
    };

    const onReady = (e: any) => {
      const { playerId } = e.detail ?? {};
      setReadySet(prev => new Set([...prev, playerId]));
    };

    const onLeft = (e: any) => {
      const { playerId } = e.detail ?? {};
      setPlayers(prev => prev.filter(p => p.playerId !== playerId));
      setReadySet(prev => { const s = new Set(prev); s.delete(playerId); return s; });
      addMessage('System', 'A player disconnected.');
    };

    const onChat = (e: any) => {
      const { playerName: pName, message } = e.detail ?? {};
      addMessage(pName, message);
    };

    const onGameStarted = (e: any) => {
      const { gameConfig: cfg } = e.detail ?? {};
      // Guest receives start signal — launch game with host config
      onGameStart(cfg ?? gameConfig);
    };

    window.addEventListener('network:playerJoined',  onJoined);
    window.addEventListener('network:playerReady',   onReady);
    window.addEventListener('network:playerLeft',    onLeft);
    window.addEventListener('network:chatMessage',   onChat);
    window.addEventListener('network:gameStarted',   onGameStarted);

    return () => {
      window.removeEventListener('network:playerJoined',  onJoined);
      window.removeEventListener('network:playerReady',   onReady);
      window.removeEventListener('network:playerLeft',    onLeft);
      window.removeEventListener('network:chatMessage',   onChat);
      window.removeEventListener('network:gameStarted',   onGameStarted);
    };
  }, [addMessage, gameConfig, onGameStart]);

  // ── Host actions ─────────────────────────────────────────────────────────────

  const handleHost = async () => {
    setLoading(true);
    setError(null);
    const result = await networkSessionManager.createLobby(
      gameConfig, factionDef.id, playerName
    );
    setLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setGameCode(result.gameCode);
    setInLobby(true);
    setPlayers([{
      playerId:   dataBridge.currentPlayer?.id,
      playerName: playerName,
      factionId:  factionDef.id,
      isHost:     true,
      ordinal:    0,
    }]);
    addMessage('System', 'Lobby created — share the game code with other players.');
  };

  const handleStartGame = async () => {
    setLoading(true);
    const result = await networkSessionManager.startGame();
    setLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    // Host launches the game directly
    onGameStart({
      ...gameConfig,
      networkSessionId: networkSessionManager.sessionId,
      networkRole:      'host',
      humanFactions:    players.map(p => p.factionId),
      playerNames:      Object.fromEntries(players.map(p => [p.factionId, p.playerName])),
    });
  };

  // ── Guest actions ─────────────────────────────────────────────────────────────

  const handleJoin = async () => {
    if (joinCode.trim().length !== 6) {
      setJoinError('Game code must be exactly 6 characters.');
      return;
    }
    setLoading(true);
    setJoinError(null);
    const result = await networkSessionManager.joinLobby(
      joinCode.trim(), factionDef.id, playerName
    );
    setLoading(false);
    if (!result.success) {
      setJoinError(result.error);
      return;
    }
    setGameCode(result.gameCode ?? joinCode.toUpperCase());
    setInLobby(true);
    setPlayers(result.sessionData?.players ?? []);
    addMessage('System', 'Joined lobby — waiting for host to start the game.');
  };

  const handleReady = () => {
    networkSessionManager.setReady();
    const myId = dataBridge.currentPlayer?.id;
    setReadySet(prev => new Set([...prev, myId]));
    setIsReady(true);
    addMessage('System', `${playerName} is ready.`);
  };

  // ── Chat ──────────────────────────────────────────────────────────────────────

  const handleSendChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    networkSessionManager.sendChatMessage(msg, playerName);
    addMessage(playerName, msg);
    setChatInput('');
  };

  const handleChatKey = (e: any) => {
    if (e.key === 'Enter') handleSendChat();
  };

  // ── Back / disconnect ─────────────────────────────────────────────────────────

  const handleBack = async () => {
    await networkSessionManager.disconnect();
    onBack();
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  const allReady = players.length > 1 && players.every(p => readySet.has(p.playerId));
  const isHost   = networkSessionManager.role === 'host';

  const renderPlayerList = () => (
    <>
      <p className="nl-players-title">Players ({players.length}/3)</p>
      <ul className="nl-players-list">
        {players.map(p => {
          const fDef   = FACTION_DISPLAY[p.factionId] ?? { name: p.factionId, color: '#8b949e' };
          const ready  = readySet.has(p.playerId);
          return (
            <li key={p.playerId} className="nl-player-row">
              <span className={`nl-player-status ${ready ? 'nl-player-status--ready' : ''}`} />
              <span className="nl-player-name">
                {p.playerName}
                {p.isHost && <span className="nl-player-host-badge"> (Host)</span>}
              </span>
              <span className="nl-player-faction" style={{ color: fDef.color }}>
                {fDef.name}
              </span>
              {ready && <span className="nl-player-ready-badge">✓ Ready</span>}
            </li>
          );
        })}
        {players.length < (gameConfig.gameMode === 'network-3p' ? 3 : 2) && (
          <li className="nl-player-row">
            <span className="nl-player-status" />
            <span className="nl-player-name" style={{ color: '#484f58', fontStyle: 'italic' }}>
              Waiting for player…
            </span>
          </li>
        )}
      </ul>
    </>
  );

  const renderChat = () => (
    <>
      <p className="nl-players-title" style={{ marginTop: '16px' }}>Lobby Chat</p>
      <div className="nl-chat-messages" ref={chatRef}>
        {messages.length === 0
          ? <span className="nl-chat-empty">No messages yet</span>
          : messages.map(m => (
              <div key={m.id} className="nl-chat-msg">
                <span className="nl-chat-msg-name">{m.name}:</span>{' '}
                <span className="nl-chat-msg-text">{m.text}</span>
              </div>
            ))
        }
      </div>
      <div className="nl-chat-input-row">
        <input
          className="nl-chat-input"
          type="text"
          placeholder="Type a message…"
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={handleChatKey}
          maxLength={200}
        />
        <button className="nl-chat-send-btn" onClick={handleSendChat}>Send</button>
      </div>
    </>
  );

  // ── Offline error state ───────────────────────────────────────────────────────

  if (isOffline) {
    return (
      <div className="nl-screen">
        <header className="nl-header">
          <h1 className="nl-title">🌐 Network Play</h1>
        </header>
        <div className="nl-offline-banner">
          <h2>Supabase Credentials Required</h2>
          <p>
            Network multiplayer requires a Supabase project.<br />
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to{' '}
            <code>.env.local</code> to enable online play.
          </p>
          <button className="nl-btn nl-btn--muted" onClick={handleBack}>← Back</button>
        </div>
      </div>
    );
  }

  // ── Lobby screen (after hosting or joining) ───────────────────────────────────

  if (inLobby) {
    return (
      <div className="nl-screen">
        <header className="nl-header">
          <h1 className="nl-title">🌐 Network Lobby</h1>
          <p className="nl-subtitle">
            {isHost ? 'You are the host' : 'Waiting for host to start'}
          </p>
        </header>

        {/* Game code display */}
        <div className="nl-card" style={{ maxWidth: '480px' }}>
          <div className="nl-code-box">
            <div className="nl-code-label">Game Code</div>
            <div className="nl-code-value">{gameCode}</div>
            <div className="nl-code-hint">Share this code with other players</div>
          </div>

          {renderPlayerList()}
          {renderChat()}
        </div>

        {error && <div className="nl-error">{error}</div>}

        <div className="nl-actions">
          <button className="nl-btn nl-btn--muted" onClick={handleBack}>
            Leave Lobby
          </button>
          {!isHost && !isReady && (
            <button className="nl-btn nl-btn--secondary" onClick={handleReady}>
              I'm Ready ✓
            </button>
          )}
          {isHost && (
            <button
              className="nl-btn nl-btn--primary"
              disabled={!allReady || loading}
              onClick={handleStartGame}
            >
              {loading ? 'Starting…' : 'Start Game →'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Entry screen (choose host or join) ────────────────────────────────────────

  return (
    <div className="nl-screen">
      <header className="nl-header">
        <h1 className="nl-title">🌐 Network Play</h1>
        <p className="nl-subtitle">Host a new game or join an existing lobby</p>
      </header>

      {/* Tabs */}
      <div className="nl-tabs">
        <button
          className={`nl-tab ${tab === 'host' ? 'nl-tab--active' : ''}`}
          onClick={() => { setTab('host'); setError(null); }}
        >
          Host Game
        </button>
        <button
          className={`nl-tab ${tab === 'join' ? 'nl-tab--active' : ''}`}
          onClick={() => { setTab('join'); setError(null); }}
        >
          Join Game
        </button>
      </div>

      {/* Host tab */}
      {tab === 'host' && (
        <div className="nl-card">
          <p className="nl-card-title">Create a New Lobby</p>
          <p style={{ fontSize: '13px', color: '#8b949e', margin: '0 0 20px' }}>
            A 6-character game code will be generated. Share it with other players so they
            can join your lobby.
          </p>
          {error && <div className="nl-error">{error}</div>}
          <div className="nl-actions">
            <button className="nl-btn nl-btn--muted" onClick={handleBack}>← Back</button>
            <button
              className="nl-btn nl-btn--primary"
              onClick={handleHost}
              disabled={loading}
            >
              {loading ? 'Creating…' : 'Create Lobby →'}
            </button>
          </div>
        </div>
      )}

      {/* Join tab */}
      {tab === 'join' && (
        <div className="nl-card">
          <p className="nl-card-title">Join an Existing Lobby</p>
          <div className="nl-field">
            <label htmlFor="nl-join-code">Game Code</label>
            <input
              id="nl-join-code"
              className="nl-input nl-input--code"
              type="text"
              placeholder="XXXXXX"
              maxLength={6}
              value={joinCode}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null); }}
            />
          </div>
          {joinError && <div className="nl-error">{joinError}</div>}
          <div className="nl-actions">
            <button className="nl-btn nl-btn--muted" onClick={handleBack}>← Back</button>
            <button
              className="nl-btn nl-btn--secondary"
              onClick={handleJoin}
              disabled={loading || joinCode.trim().length === 0}
            >
              {loading ? 'Joining…' : 'Join Lobby →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
