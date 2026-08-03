/**
 * Gomoku — Five-in-a-Row
 * Clean modular architecture for game logic and UI.
 */

import {
  BOARD_SIZE,
  EMPTY,
  BLACK,
  WHITE,
  PLAYER_NAMES,
  WinChecker,
} from './core.js';
import { AIPlayer, DIFFICULTY } from './ai.js';
import { ForbiddenChecker } from './forbidden.js';
import {
  OnlineClient,
  generateRoomCode,
  normalizeRoomCode,
} from './online.js';

/* ==========================================================================
   GameState — manages board data, turn, history, and scores
   ========================================================================== */

class GameState {
  constructor() {
    this.boardData = [];
    this.currentPlayer = BLACK;
    this.moveHistory = [];
    this.scores = { [BLACK]: 0, [WHITE]: 0 };
    this.gameOver = false;
    this.winner = null;
    this.initializeBoard();
  }

  initializeBoard() {
    this.boardData = Array.from({ length: BOARD_SIZE }, () =>
      Array(BOARD_SIZE).fill(EMPTY)
    );
  }

  resetGame() {
    this.initializeBoard();
    this.currentPlayer = BLACK;
    this.moveHistory = [];
    this.gameOver = false;
    this.winner = null;
  }

  placeStone(row, col) {
    if (this.gameOver || this.boardData[row][col] !== EMPTY) {
      return false;
    }

    this.boardData[row][col] = this.currentPlayer;
    this.moveHistory.push({ row, col, player: this.currentPlayer });
    return true;
  }

  /**
   * Apply a confirmed online move (player may differ from local currentPlayer sync).
   */
  placeStoneAs(row, col, player) {
    if (this.boardData[row][col] !== EMPTY) return false;
    this.boardData[row][col] = player;
    this.moveHistory.push({ row, col, player });
    this.currentPlayer = player;
    return true;
  }

  undoMove() {
    if (this.moveHistory.length === 0) return null;

    const lastMove = this.moveHistory.pop();
    this.boardData[lastMove.row][lastMove.col] = EMPTY;
    this.gameOver = false;
    this.winner = null;
    this.currentPlayer = lastMove.player;
    return lastMove;
  }

  switchPlayer() {
    this.currentPlayer = this.currentPlayer === BLACK ? WHITE : BLACK;
  }

  isBoardFull() {
    return this.boardData.every((row) => row.every((cell) => cell !== EMPTY));
  }

  incrementScore(player) {
    this.scores[player]++;
  }
}

/* ==========================================================================
   GameBoard — DOM rendering and interaction
   ========================================================================== */

class GameBoard {
  constructor(container, onCellClick) {
    this.container = container;
    this.onCellClick = onCellClick;
    this.cells = [];
    this.render();
  }

  render() {
    this.container.innerHTML = '';
    this.cells = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.type = 'button';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', `Row ${row + 1}, Column ${col + 1}`);
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.addEventListener('click', () => this.onCellClick(row, col));
        this.container.appendChild(cell);
        this.cells.push(cell);
      }
    }
  }

  getCell(row, col) {
    return this.cells[row * BOARD_SIZE + col];
  }

  placeStone(row, col, player) {
    const cell = this.getCell(row, col);
    cell.classList.add('cell--occupied');
    cell.classList.remove('cell--hint');
    cell.disabled = true;

    const stone = document.createElement('span');
    stone.className = `stone stone--${player === BLACK ? 'black' : 'white'}`;
    stone.setAttribute('aria-hidden', 'true');
    cell.appendChild(stone);
  }

  removeStone(row, col) {
    const cell = this.getCell(row, col);
    cell.classList.remove('cell--occupied', 'cell--disabled', 'cell--hint');
    cell.disabled = false;
    const stone = cell.querySelector('.stone');
    if (stone) stone.remove();
  }

  clearBoard() {
    this.cells.forEach((cell) => {
      cell.classList.remove('cell--occupied', 'cell--disabled', 'cell--hint', 'cell--forbidden');
      cell.disabled = false;
      const stone = cell.querySelector('.stone');
      if (stone) stone.remove();
    });
  }

  setDisabled(disabled) {
    this.cells.forEach((cell) => {
      if (!cell.classList.contains('cell--occupied')) {
        cell.classList.toggle('cell--disabled', disabled);
        cell.disabled = disabled;
      }
    });
  }

  clearHint() {
    this.cells.forEach((cell) => cell.classList.remove('cell--hint'));
  }

  showHint(row, col) {
    this.clearHint();
    const cell = this.getCell(row, col);
    if (!cell.classList.contains('cell--occupied')) {
      cell.classList.add('cell--hint');
    }
  }

  flashForbidden(row, col) {
    const cell = this.getCell(row, col);
    cell.classList.remove('cell--forbidden');
    void cell.offsetWidth;
    cell.classList.add('cell--forbidden');
    setTimeout(() => cell.classList.remove('cell--forbidden'), 400);
  }
}

/* ==========================================================================
   UIController
   ========================================================================== */

class UIController {
  constructor() {
    this.statusText = document.getElementById('status-text');
    this.statusDot = document.getElementById('status-dot');
    this.scoreBlack = document.getElementById('score-black');
    this.scoreWhite = document.getElementById('score-white');
    this.scoreBlackLabel = document.getElementById('score-black-label');
    this.scoreWhiteLabel = document.getElementById('score-white-label');
    this.moveHistory = document.getElementById('move-history');
    this.btnNewGame = document.getElementById('btn-new-game');
    this.btnUndo = document.getElementById('btn-undo');
    this.btnHint = document.getElementById('btn-hint');
    this.aiToggle = document.getElementById('ai-mode');
    this.aiHint = document.getElementById('ai-mode-hint');
    this.aiOptions = document.getElementById('ai-options');
    this.difficultySelect = document.getElementById('ai-difficulty');
    this.playAsBlack = document.getElementById('play-as-black');
    this.playAsWhite = document.getElementById('play-as-white');
    this.forbiddenToggle = document.getElementById('forbidden-moves');
    this.forbiddenHint = document.getElementById('forbidden-hint');
    this.onlineToggle = document.getElementById('online-mode');
    this.onlineHint = document.getElementById('online-hint');
    this.onlineOptions = document.getElementById('online-options');
    this.roomCodeInput = document.getElementById('room-code');
    this.btnGenerateCode = document.getElementById('btn-generate-code');
    this.btnJoinRoom = document.getElementById('btn-join-room');
    this.btnLeaveRoom = document.getElementById('btn-leave-room');
    this.onlineStatus = document.getElementById('online-status');
    this.consentDialog = document.getElementById('consent-dialog');
    this.consentTitle = document.getElementById('consent-title');
    this.consentMessage = document.getElementById('consent-message');
    this.btnConsentAccept = document.getElementById('btn-consent-accept');
    this.btnConsentDecline = document.getElementById('btn-consent-decline');
    this.toast = document.getElementById('toast');
    this._toastTimer = null;
    this._consentHandler = null;
  }

  updateStatus(text, dotClass) {
    this.statusText.textContent = text;
    this.statusDot.className = `status-dot status-dot--${dotClass}`;
  }

  showToast(message) {
    if (this._toastTimer) {
      clearTimeout(this._toastTimer);
      this._toastTimer = null;
    }

    this.toast.hidden = false;
    this.toast.textContent = message;
    void this.toast.offsetWidth;
    this.toast.classList.add('is-visible');

    this._toastTimer = setTimeout(() => {
      this.toast.classList.remove('is-visible');
      this._toastTimer = setTimeout(() => {
        this.toast.hidden = true;
        this._toastTimer = null;
      }, 250);
    }, 2200);
  }

  updateForbiddenControls(enabled, locked = false) {
    this.forbiddenToggle.checked = enabled;
    this.forbiddenToggle.disabled = locked;
    this.forbiddenHint.textContent = locked
      ? 'Locked on · Online room rule'
      : enabled
        ? 'On · 三三 / 四四 / 长连'
        : 'Off · Free-style Gomoku';
  }

  updateScores(scores) {
    this.scoreBlack.textContent = scores[BLACK];
    this.scoreWhite.textContent = scores[WHITE];
  }

  updateScoreLabels({ aiEnabled, humanPlayer, onlineEnabled, myColor }) {
    if (onlineEnabled && myColor) {
      this.scoreBlackLabel.textContent = myColor === BLACK ? 'You' : 'Opponent';
      this.scoreWhiteLabel.textContent = myColor === WHITE ? 'You' : 'Opponent';
      return;
    }

    if (!aiEnabled) {
      this.scoreBlackLabel.textContent = 'Black';
      this.scoreWhiteLabel.textContent = 'White';
      return;
    }

    this.scoreBlackLabel.textContent = humanPlayer === BLACK ? 'You' : 'AI';
    this.scoreWhiteLabel.textContent = humanPlayer === WHITE ? 'You' : 'AI';
  }

  updateAiControls(aiEnabled, difficulty, humanPlayer, locked = false) {
    this.aiToggle.checked = aiEnabled;
    this.aiToggle.disabled = locked;
    this.aiOptions.hidden = !aiEnabled || locked;
    this.difficultySelect.value = difficulty;
    this._updateColorPicker(humanPlayer);

    if (locked) {
      this.aiHint.textContent = 'Disabled in Online Mode';
      return;
    }

    if (!aiEnabled) {
      this.aiHint.textContent = 'Human vs Human';
      return;
    }

    const colorName = humanPlayer === BLACK ? 'Black' : 'White';
    this.aiHint.textContent = `You (${colorName}) vs AI · ${this._difficultyLabel(difficulty)}`;
  }

  updateOnlineControls({ enabled, inRoom, statusText }) {
    this.onlineToggle.checked = enabled;
    this.onlineOptions.hidden = !enabled;
    this.onlineHint.textContent = enabled
      ? inRoom
        ? 'Connected'
        : 'On · Enter a room code'
      : 'Off · Local play';

    this.roomCodeInput.disabled = inRoom;
    this.btnGenerateCode.disabled = inRoom;
    this.btnJoinRoom.disabled = inRoom;
    this.btnLeaveRoom.disabled = !inRoom;

    if (statusText) {
      this.onlineStatus.textContent = statusText;
    }
  }

  setOnlineStatus(text) {
    this.onlineStatus.textContent = text;
  }

  showConsent({ title, message, onAccept, onDecline }) {
    this.hideConsent();
    this.consentTitle.textContent = title;
    this.consentMessage.textContent = message;
    this.consentDialog.hidden = false;

    this._consentHandler = { onAccept, onDecline };
  }

  hideConsent() {
    this.consentDialog.hidden = true;
    this._consentHandler = null;
  }

  _updateColorPicker(humanPlayer) {
    const blackActive = humanPlayer === BLACK;
    this.playAsBlack.classList.toggle('is-active', blackActive);
    this.playAsWhite.classList.toggle('is-active', !blackActive);
    this.playAsBlack.setAttribute('aria-checked', String(blackActive));
    this.playAsWhite.setAttribute('aria-checked', String(!blackActive));
  }

  _difficultyLabel(difficulty) {
    const labels = {
      [DIFFICULTY.EASY]: 'Easy',
      [DIFFICULTY.MEDIUM]: 'Medium',
      [DIFFICULTY.HARD]: 'Hard',
    };
    return labels[difficulty] || 'Medium';
  }

  updateHistory(history, { aiEnabled, aiPlayer, onlineEnabled, myColor }) {
    if (history.length === 0) {
      this.moveHistory.innerHTML = '<li class="history-list__empty">No moves yet</li>';
      return;
    }

    this.moveHistory.innerHTML = history
      .map((move, index) => {
        let playerName = PLAYER_NAMES[move.player];
        if (onlineEnabled && myColor) {
          playerName = move.player === myColor ? 'You' : 'Opponent';
        } else if (aiEnabled && move.player === aiPlayer) {
          playerName = 'AI';
        }
        const playerClass = move.player === BLACK ? 'black' : 'white';
        return `
          <li class="history-item">
            Move ${index + 1}:
            <span class="history-item__player history-item__player--${playerClass}">${playerName}</span>
            placed at (${move.row + 1}, ${move.col + 1})
          </li>`;
      })
      .join('');

    this.moveHistory.scrollTop = this.moveHistory.scrollHeight;
  }

  setUndoEnabled(enabled) {
    this.btnUndo.disabled = !enabled;
  }

  setHintEnabled(enabled) {
    this.btnHint.disabled = !enabled;
  }
}

/* ==========================================================================
   Game
   ========================================================================== */

class Game {
  constructor() {
    this.state = new GameState();
    this.ui = new UIController();
    this.ai = new AIPlayer(DIFFICULTY.MEDIUM);
    this.aiEnabled = false;
    this.forbiddenMoves = false;
    this.humanPlayer = BLACK;
    this.aiThinking = false;
    this.aiTimer = null;

    this.onlineEnabled = false;
    this.onlineInRoom = false;
    this.myColor = null;
    this.onlineAwaiting = false;
    this.pendingJoinCode = null;

    this.online = new OnlineClient({
      onOpen: () => this._onOnlineOpen(),
      onClose: () => this._onOnlineClose(),
      onError: (message) => this._onOnlineError(message),
      onWaiting: (msg) => this._onOnlineWaiting(msg),
      onStart: (msg) => this._onOnlineStart(msg),
      onMove: (msg) => this._onOnlineMove(msg),
      onReject: (msg) => this._onOnlineReject(msg),
      onUndoWaiting: () => this._onUndoWaiting(),
      onUndoRequest: () => this._onUndoRequest(),
      onUndoResult: (msg) => this._onUndoResult(msg),
      onNewGameWaiting: () => this._onNewGameWaiting(),
      onNewGameRequest: () => this._onNewGameRequest(),
      onNewGameResult: (msg) => this._onNewGameResult(msg),
      onPeerLeft: (msg) => this._onPeerLeft(msg),
      onLeft: () => this._onLeftRoom(),
    });

    this.board = new GameBoard(
      document.getElementById('board'),
      (row, col) => this.handleMove(row, col)
    );

    this._bindEvents();
    this._refreshUI();
  }

  get aiPlayer() {
    return this.humanPlayer === BLACK ? WHITE : BLACK;
  }

  _bindEvents() {
    this.ui.btnNewGame.addEventListener('click', () => this.newGame());
    this.ui.btnUndo.addEventListener('click', () => this.undoMove());
    this.ui.btnHint.addEventListener('click', () => this.showHint());

    this.ui.onlineToggle.addEventListener('change', () => {
      this._setOnlineMode(this.ui.onlineToggle.checked);
    });

    this.ui.btnGenerateCode.addEventListener('click', () => {
      this.ui.roomCodeInput.value = generateRoomCode();
    });

    this.ui.btnJoinRoom.addEventListener('click', () => this._joinRoom());
    this.ui.btnLeaveRoom.addEventListener('click', () => this._leaveRoom());

    this.ui.roomCodeInput.addEventListener('input', () => {
      const caret = this.ui.roomCodeInput.selectionStart;
      this.ui.roomCodeInput.value = normalizeRoomCode(this.ui.roomCodeInput.value);
      this.ui.roomCodeInput.setSelectionRange(caret, caret);
    });

    this.ui.roomCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._joinRoom();
    });

    this.ui.btnConsentAccept.addEventListener('click', () => {
      const handler = this.ui._consentHandler;
      this.ui.hideConsent();
      handler?.onAccept?.();
    });

    this.ui.btnConsentDecline.addEventListener('click', () => {
      const handler = this.ui._consentHandler;
      this.ui.hideConsent();
      handler?.onDecline?.();
    });

    this.ui.aiToggle.addEventListener('change', () => {
      if (this.onlineEnabled) {
        this.ui.aiToggle.checked = false;
        return;
      }
      this.aiEnabled = this.ui.aiToggle.checked;
      this.newGame();
    });

    this.ui.forbiddenToggle.addEventListener('change', () => {
      if (this.onlineEnabled) {
        this.ui.forbiddenToggle.checked = true;
        return;
      }
      this.forbiddenMoves = this.ui.forbiddenToggle.checked;
      this.ai.setForbiddenMoves(this.forbiddenMoves);
      this.ui.updateForbiddenControls(this.forbiddenMoves);
    });

    this.ui.difficultySelect.addEventListener('change', () => {
      this.ai.setDifficulty(this.ui.difficultySelect.value);
      if (this.aiEnabled && !this.onlineEnabled) this.newGame();
      else this._refreshUI();
    });

    this.ui.playAsBlack.addEventListener('click', () => this._setHumanColor(BLACK));
    this.ui.playAsWhite.addEventListener('click', () => this._setHumanColor(WHITE));

    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'r' || e.key === 'R') {
        this.newGame();
      } else if (e.key === 'h' || e.key === 'H') {
        this.showHint();
      }
    });
  }

  /* ---------- Online mode ---------- */

  _setOnlineMode(enabled) {
    if (enabled) {
      this.onlineEnabled = true;
      this.aiEnabled = false;
      this.forbiddenMoves = true;
      this.ai.setForbiddenMoves(true);
      this._cancelAiTimer();
      this.state.resetGame();
      this.board.clearBoard();
      this.myColor = null;
      this.onlineInRoom = false;
      this.pendingJoinCode = null;
      this.ui.updateOnlineControls({
        enabled: true,
        inRoom: false,
        statusText: 'Generate a code and Join — works after Cloudflare deploy',
      });
      this._refreshUI();
    } else {
      if (this.onlineInRoom || this.online.connected) this.online.leave();
      else this.online.disconnect(false);
      this.onlineEnabled = false;
      this.onlineInRoom = false;
      this.myColor = null;
      this.onlineAwaiting = false;
      this.pendingJoinCode = null;
      this.ui.hideConsent();
      this.forbiddenMoves = this.ui.forbiddenToggle.checked;
      this.ai.setForbiddenMoves(this.forbiddenMoves);
      this.state.resetGame();
      this.board.clearBoard();
      this.ui.updateOnlineControls({
        enabled: false,
        inRoom: false,
        statusText: 'Enter the same code as your opponent',
      });
      this._refreshUI();
    }
  }

  _joinRoom() {
    if (!this.onlineEnabled) return;
    const code = normalizeRoomCode(this.ui.roomCodeInput.value);
    if (code.length !== 6) {
      this.ui.showToast('请输入 6 位房间码');
      return;
    }
    this.ui.roomCodeInput.value = code;
    this.ui.setOnlineStatus(`Connecting to room ${code}…`);
    // Opening the WebSocket joins the Durable Object room
    this.online.connect(code);
  }

  _leaveRoom() {
    if (!this.onlineEnabled) return;
    this.online.leave();
  }

  _onOnlineOpen() {
    this.ui.setOnlineStatus(
      this.online.roomCode
        ? `Connected · room ${this.online.roomCode}`
        : 'Connected'
    );
  }

  _onOnlineClose() {
    if (!this.onlineEnabled) return;
    this.onlineInRoom = false;
    this.myColor = null;
    this.onlineAwaiting = false;
    this.ui.hideConsent();
    this.ui.updateOnlineControls({
      enabled: true,
      inRoom: false,
      statusText: 'Disconnected · retry Join',
    });
    this.ui.showToast('与服务器断开连接');
    this._refreshUI();
  }

  _onOnlineError(message) {
    this.ui.showToast(message);
    this.ui.setOnlineStatus(message);
  }

  _onOnlineWaiting(msg) {
    this.onlineInRoom = true;
    this.myColor = null;
    this.ui.roomCodeInput.value = msg.roomCode;
    this.ui.updateOnlineControls({
      enabled: true,
      inRoom: true,
      statusText: `Room ${msg.roomCode} · Waiting for opponent…`,
    });
    this.ui.updateStatus('Waiting for opponent…', 'neutral');
    this.board.setDisabled(true);
  }

  _onOnlineStart(msg) {
    this.onlineInRoom = true;
    this.onlineAwaiting = false;
    this.ui.hideConsent();
    this.myColor = msg.color;
    this.forbiddenMoves = true;
    this.ai.setForbiddenMoves(true);

    this._cancelAiTimer();
    this.state.resetGame();
    this.board.clearBoard();
    this.state.currentPlayer = msg.currentPlayer || BLACK;

    const colorName = msg.color === BLACK ? 'Black' : 'White';
    this.ui.roomCodeInput.value = msg.roomCode;
    this.ui.updateOnlineControls({
      enabled: true,
      inRoom: true,
      statusText: `Room ${msg.roomCode} · You are ${colorName}`,
    });
    this.ui.showToast(`对局开始 · 你执${msg.color === BLACK ? '黑' : '白'}`);
    this._refreshUI();
  }

  _onOnlineMove(msg) {
    this.board.clearHint();
    this.onlineAwaiting = false;

    if (!this.state.placeStoneAs(msg.row, msg.col, msg.player)) {
      return;
    }

    this.board.placeStone(msg.row, msg.col, msg.player);

    if (msg.gameOver) {
      if (msg.draw) {
        this._endOnlineGame(null);
      } else {
        this._endOnlineGame(msg.winner);
      }
      return;
    }

    this.state.currentPlayer = msg.currentPlayer;
    this.state.gameOver = false;
    this._refreshUI();
  }

  _onOnlineReject(msg) {
    this.onlineAwaiting = false;
    if (msg.reason === 'forbidden') {
      this.board.flashForbidden(msg.row, msg.col);
      this.ui.showToast(msg.message || '禁手，请换个位置');
      this.ui.updateStatus(`禁手：${msg.label} · 请重下`, 'warning');
      setTimeout(() => {
        if (!this.state.gameOver) this._refreshUI();
      }, 2200);
      return;
    }
    this.ui.showToast(msg.message || '落子无效');
    this._refreshUI();
  }

  _onUndoWaiting() {
    this.onlineAwaiting = true;
    this.ui.showToast('已发送悔棋请求，等待对方同意…');
    this.ui.setOnlineStatus('Waiting for undo approval…');
    this._refreshUI();
  }

  _onUndoRequest() {
    this.ui.showConsent({
      title: 'Undo Request',
      message: '对方请求悔棋，是否同意？',
      onAccept: () => this.online.respondUndo(true),
      onDecline: () => this.online.respondUndo(false),
    });
  }

  _onUndoResult(msg) {
    this.onlineAwaiting = false;
    this.ui.hideConsent();

    if (!msg.accepted) {
      this.ui.showToast('对方拒绝了悔棋');
      this._refreshUI();
      return;
    }

    const removed = this.state.undoMove();
    if (removed) {
      this.board.removeStone(removed.row, removed.col);
    }
    this.state.currentPlayer = msg.currentPlayer;
    this.state.gameOver = false;
    this.board.setDisabled(false);
    this.ui.showToast('已悔棋');
    this._refreshUI();
  }

  _onNewGameWaiting() {
    this.onlineAwaiting = true;
    this.ui.showToast('已发送重开请求，等待对方同意…');
    this._refreshUI();
  }

  _onNewGameRequest() {
    this.ui.showConsent({
      title: 'New Game',
      message: '对方请求重新开始，是否同意？',
      onAccept: () => this.online.respondNewGame(true),
      onDecline: () => this.online.respondNewGame(false),
    });
  }

  _onNewGameResult(msg) {
    this.onlineAwaiting = false;
    this.ui.hideConsent();
    if (!msg.accepted) {
      this.ui.showToast('对方拒绝了重开');
      this._refreshUI();
    }
    // If accepted, server will send `start`
  }

  _onPeerLeft(msg) {
    this.onlineInRoom = false;
    this.myColor = null;
    this.onlineAwaiting = false;
    this.ui.hideConsent();
    this.state.resetGame();
    this.board.clearBoard();
    this.ui.updateOnlineControls({
      enabled: true,
      inRoom: false,
      statusText: 'Opponent left · join again with a code',
    });
    this.ui.showToast(msg.message || '对方已离开');
    this._refreshUI();
  }

  _onLeftRoom() {
    this.onlineInRoom = false;
    this.myColor = null;
    this.onlineAwaiting = false;
    this.ui.hideConsent();
    this.state.resetGame();
    this.board.clearBoard();
    this.ui.updateOnlineControls({
      enabled: true,
      inRoom: false,
      statusText: 'Left room · enter a code to join again',
    });
    this._refreshUI();
  }

  _endOnlineGame(winner) {
    this.state.gameOver = true;
    this.state.winner = winner;
    this.board.clearHint();

    if (winner) {
      this.state.incrementScore(winner);
      const label = winner === this.myColor ? 'You Win!' : 'Opponent Wins!';
      this.ui.updateStatus(label, winner === BLACK ? 'black' : 'white');
    } else {
      this.ui.updateStatus('Draw Game', 'neutral');
    }

    this.board.setDisabled(true);
    this.ui.updateScores(this.state.scores);
    this.ui.updateHistory(this.state.moveHistory, this._historyContext());
    this.ui.setUndoEnabled(this._canUndo());
    this.ui.setHintEnabled(false);
  }

  /* ---------- Local / shared flow ---------- */

  _setHumanColor(color) {
    if (this.onlineEnabled || !this.aiEnabled || this.humanPlayer === color) return;
    this.humanPlayer = color;
    this.newGame();
  }

  handleMove(row, col) {
    if (this.state.gameOver || this.aiThinking || this.onlineAwaiting) return;

    if (this.onlineEnabled) {
      if (!this.onlineInRoom || !this.myColor) return;
      if (this.state.currentPlayer !== this.myColor) return;
      if (this.state.boardData[row][col] !== EMPTY) return;
      this.board.clearHint();
      this.onlineAwaiting = true;
      this.online.sendMove(row, col);
      return;
    }

    if (this.aiEnabled && this.state.currentPlayer !== this.humanPlayer) return;
    if (this.state.boardData[row][col] !== EMPTY) return;

    if (this.forbiddenMoves && this.state.currentPlayer === BLACK) {
      const forbidden = ForbiddenChecker.check(this.state.boardData, row, col);
      if (forbidden) {
        this._rejectForbidden(row, col, forbidden.label);
        return;
      }
    }

    this.board.clearHint();

    if (!this._applyMove(row, col)) return;
    if (this.state.gameOver) return;

    if (this.aiEnabled && this.state.currentPlayer === this.aiPlayer) {
      this._scheduleAiMove();
    }
  }

  showHint() {
    if (!this._canShowHint()) return;

    const player = this.state.currentPlayer;
    const hint = this.ai.getHintMove(this.state.boardData, player);

    if (!hint) {
      this.ui.showToast('当前没有可用提示');
      return;
    }

    this.board.showHint(hint.row, hint.col);
    this.ui.showToast(`建议落子：(${hint.row + 1}, ${hint.col + 1})`);
  }

  _canShowHint() {
    if (this.state.gameOver || this.aiThinking || this.onlineAwaiting) return false;
    if (this.onlineEnabled) {
      return this.onlineInRoom && this.myColor && this.state.currentPlayer === this.myColor;
    }
    if (this.aiEnabled && this.state.currentPlayer !== this.humanPlayer) return false;
    return true;
  }

  _rejectForbidden(row, col, label) {
    this.board.flashForbidden(row, col);
    this.ui.showToast(`不能下这儿（${label}禁手），请换个位置`);
    this.ui.updateStatus(`禁手：${label} · 请重下`, 'warning');

    setTimeout(() => {
      if (this.state.gameOver || this.aiThinking) return;
      if (this.state.currentPlayer !== BLACK) return;

      let statusText = "Black's Turn";
      if (this.aiEnabled) {
        statusText =
          this.humanPlayer === BLACK ? 'Your Turn' : 'AI is thinking…';
      }
      this.ui.updateStatus(statusText, 'black');
    }, 2200);
  }

  _applyMove(row, col) {
    const player = this.state.currentPlayer;
    if (!this.state.placeStone(row, col)) return false;

    this.board.placeStone(row, col, player);

    if (
      WinChecker.checkWinner(this.state.boardData, row, col, player, {
        forbidBlackOverline: this.forbiddenMoves,
      })
    ) {
      this._endGame(player);
      return true;
    }

    if (this.state.isBoardFull()) {
      this._endGame(null);
      return true;
    }

    this.state.switchPlayer();
    this._refreshUI();
    return true;
  }

  _scheduleAiMove() {
    this._cancelAiTimer();
    this.aiThinking = true;
    this.board.setDisabled(true);
    this.ui.setUndoEnabled(false);
    this.ui.updateStatus(
      'AI is thinking…',
      this.aiPlayer === BLACK ? 'black' : 'white'
    );

    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      this._runAiMove();
    }, this.ai.getThinkDelay());
  }

  _runAiMove() {
    if (this.state.gameOver || !this.aiEnabled) {
      this.aiThinking = false;
      this.board.setDisabled(false);
      this._refreshUI();
      return;
    }

    const move = this.ai.getMove(this.state.boardData, this.aiPlayer);
    this.aiThinking = false;

    if (!move || !this._applyMove(move.row, move.col)) {
      this.board.setDisabled(false);
      this._refreshUI();
    }
  }

  _cancelAiTimer() {
    if (this.aiTimer !== null) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
    this.aiThinking = false;
  }

  undoMove() {
    if (this.aiThinking || this.onlineAwaiting) return;

    if (this.onlineEnabled) {
      if (!this.onlineInRoom || this.state.moveHistory.length === 0) return;
      this.board.clearHint();
      this.online.requestUndo();
      return;
    }

    this.board.clearHint();

    const steps = this.aiEnabled ? 2 : 1;
    let undone = 0;

    for (let i = 0; i < steps; i++) {
      const lastMove = this.state.undoMove();
      if (!lastMove) break;
      this.board.removeStone(lastMove.row, lastMove.col);
      undone++;
    }

    if (undone === 0) return;

    if (this.aiEnabled && this.state.currentPlayer !== this.humanPlayer) {
      const extra = this.state.undoMove();
      if (extra) this.board.removeStone(extra.row, extra.col);
    }

    this.board.setDisabled(false);
    this._refreshUI();

    if (
      this.aiEnabled &&
      !this.state.gameOver &&
      this.state.currentPlayer === this.aiPlayer
    ) {
      this._scheduleAiMove();
    }
  }

  newGame() {
    if (this.onlineEnabled) {
      if (!this.onlineInRoom) {
        this.ui.showToast('请先加入房间');
        return;
      }
      if (this.onlineAwaiting) return;
      this.board.clearHint();
      this.online.requestNewGame();
      return;
    }

    this._cancelAiTimer();
    this.state.resetGame();
    this.board.clearBoard();
    this._refreshUI();

    if (this.aiEnabled && this.state.currentPlayer === this.aiPlayer) {
      this._scheduleAiMove();
    }
  }

  _endGame(winner) {
    this._cancelAiTimer();
    this.board.clearHint();
    this.state.gameOver = true;
    this.state.winner = winner;

    if (winner) {
      this.state.incrementScore(winner);
      let label = `${PLAYER_NAMES[winner]} Wins!`;
      if (this.aiEnabled) {
        label = winner === this.humanPlayer ? 'You Win!' : 'AI Wins!';
      }
      this.ui.updateStatus(label, winner === BLACK ? 'black' : 'white');
    } else {
      this.ui.updateStatus('Draw Game', 'neutral');
    }

    this.board.setDisabled(true);
    this.ui.updateScores(this.state.scores);
    this.ui.updateHistory(this.state.moveHistory, this._historyContext());
    this.ui.setUndoEnabled(this._canUndo());
    this.ui.setHintEnabled(false);
  }

  _historyContext() {
    return {
      aiEnabled: this.aiEnabled && !this.onlineEnabled,
      aiPlayer: this.aiPlayer,
      onlineEnabled: this.onlineEnabled && !!this.myColor,
      myColor: this.myColor,
    };
  }

  _refreshUI() {
    const { currentPlayer, gameOver } = this.state;

    this.ui.updateScores(this.state.scores);
    this.ui.updateScoreLabels({
      aiEnabled: this.aiEnabled,
      humanPlayer: this.humanPlayer,
      onlineEnabled: this.onlineEnabled && !!this.myColor,
      myColor: this.myColor,
    });
    this.ui.updateAiControls(
      this.aiEnabled,
      this.ai.difficulty,
      this.humanPlayer,
      this.onlineEnabled
    );
    this.ui.updateForbiddenControls(this.forbiddenMoves, this.onlineEnabled);
    this.ui.updateOnlineControls({
      enabled: this.onlineEnabled,
      inRoom: this.onlineInRoom,
    });
    this.ui.updateHistory(this.state.moveHistory, this._historyContext());

    if (this.onlineEnabled && this.onlineInRoom && !this.myColor) {
      this.ui.setUndoEnabled(false);
      this.ui.setHintEnabled(false);
      this.board.setDisabled(true);
      return;
    }

    if (gameOver || this.aiThinking || this.onlineAwaiting) {
      this.ui.setUndoEnabled(
        !this.aiThinking && !this.onlineAwaiting && this._canUndo()
      );
      this.ui.setHintEnabled(false);
      if (this.onlineAwaiting || this.aiThinking) {
        this.board.setDisabled(true);
      }
      return;
    }

    let statusText = `${PLAYER_NAMES[currentPlayer]}'s Turn`;
    let dot = currentPlayer === BLACK ? 'black' : 'white';

    if (this.onlineEnabled && this.myColor) {
      statusText =
        currentPlayer === this.myColor ? 'Your Turn' : "Opponent's Turn";
    } else if (this.aiEnabled) {
      statusText =
        currentPlayer === this.humanPlayer ? 'Your Turn' : 'AI is thinking…';
    }

    this.ui.updateStatus(statusText, dot);
    this.ui.setUndoEnabled(this._canUndo());
    this.ui.setHintEnabled(this._canShowHint());

    const canInteract =
      !this.onlineEnabled ||
      (this.myColor && currentPlayer === this.myColor);
    this.board.setDisabled(!canInteract);
  }

  _canUndo() {
    if (this.state.moveHistory.length === 0) return false;
    if (this.onlineEnabled) return this.onlineInRoom && !!this.myColor;
    if (!this.aiEnabled) return true;
    return this.state.moveHistory.some((move) => move.player === this.humanPlayer);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Game();
});
