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

  /**
   * Place a stone at (row, col). Returns false if invalid.
   */
  placeStone(row, col) {
    if (this.gameOver || this.boardData[row][col] !== EMPTY) {
      return false;
    }

    this.boardData[row][col] = this.currentPlayer;
    this.moveHistory.push({ row, col, player: this.currentPlayer });
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
    cell.disabled = true;

    const stone = document.createElement('span');
    stone.className = `stone stone--${player === BLACK ? 'black' : 'white'}`;
    stone.setAttribute('aria-hidden', 'true');
    cell.appendChild(stone);
  }

  removeStone(row, col) {
    const cell = this.getCell(row, col);
    cell.classList.remove('cell--occupied', 'cell--disabled');
    cell.disabled = false;
    const stone = cell.querySelector('.stone');
    if (stone) stone.remove();
  }

  clearBoard() {
    this.cells.forEach((cell) => {
      cell.classList.remove('cell--occupied', 'cell--disabled');
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

  flashForbidden(row, col) {
    const cell = this.getCell(row, col);
    cell.classList.remove('cell--forbidden');
    void cell.offsetWidth;
    cell.classList.add('cell--forbidden');
    setTimeout(() => cell.classList.remove('cell--forbidden'), 400);
  }
}

/* ==========================================================================
   UIController — status, score, history, and control panel updates
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
    this.aiToggle = document.getElementById('ai-mode');
    this.aiHint = document.getElementById('ai-mode-hint');
    this.aiOptions = document.getElementById('ai-options');
    this.difficultySelect = document.getElementById('ai-difficulty');
    this.playAsBlack = document.getElementById('play-as-black');
    this.playAsWhite = document.getElementById('play-as-white');
    this.forbiddenToggle = document.getElementById('forbidden-moves');
    this.forbiddenHint = document.getElementById('forbidden-hint');
    this.toast = document.getElementById('toast');
    this._toastTimer = null;
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
    // Force reflow so the enter transition always plays
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

  updateForbiddenControls(enabled) {
    this.forbiddenToggle.checked = enabled;
    this.forbiddenHint.textContent = enabled
      ? 'On · 三三 / 四四 / 长连'
      : 'Off · Free-style Gomoku';
  }

  updateScores(scores) {
    this.scoreBlack.textContent = scores[BLACK];
    this.scoreWhite.textContent = scores[WHITE];
  }

  updateScoreLabels(aiEnabled, humanPlayer) {
    if (!aiEnabled) {
      this.scoreBlackLabel.textContent = 'Black';
      this.scoreWhiteLabel.textContent = 'White';
      return;
    }

    this.scoreBlackLabel.textContent = humanPlayer === BLACK ? 'You' : 'AI';
    this.scoreWhiteLabel.textContent = humanPlayer === WHITE ? 'You' : 'AI';
  }

  updateAiControls(aiEnabled, difficulty, humanPlayer) {
    this.aiToggle.checked = aiEnabled;
    this.aiOptions.hidden = !aiEnabled;
    this.difficultySelect.value = difficulty;
    this._updateColorPicker(humanPlayer);

    if (!aiEnabled) {
      this.aiHint.textContent = 'Human vs Human';
      return;
    }

    const colorName = humanPlayer === BLACK ? 'Black' : 'White';
    this.aiHint.textContent = `You (${colorName}) vs AI · ${this._difficultyLabel(difficulty)}`;
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

  updateHistory(history, aiEnabled, aiPlayer) {
    if (history.length === 0) {
      this.moveHistory.innerHTML = '<li class="history-list__empty">No moves yet</li>';
      return;
    }

    this.moveHistory.innerHTML = history
      .map((move, index) => {
        const isAi = aiEnabled && move.player === aiPlayer;
        const playerName = isAi ? 'AI' : PLAYER_NAMES[move.player];
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
}

/* ==========================================================================
   Game — orchestrates state, board, and UI
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

    this.ui.aiToggle.addEventListener('change', () => {
      this.aiEnabled = this.ui.aiToggle.checked;
      this.newGame();
    });

    this.ui.forbiddenToggle.addEventListener('change', () => {
      this.forbiddenMoves = this.ui.forbiddenToggle.checked;
      this.ai.setForbiddenMoves(this.forbiddenMoves);
      this.ui.updateForbiddenControls(this.forbiddenMoves);
    });

    this.ui.difficultySelect.addEventListener('change', () => {
      this.ai.setDifficulty(this.ui.difficultySelect.value);
      if (this.aiEnabled) this.newGame();
      else this._refreshUI();
    });

    this.ui.playAsBlack.addEventListener('click', () => this._setHumanColor(BLACK));
    this.ui.playAsWhite.addEventListener('click', () => this._setHumanColor(WHITE));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
          this.newGame();
        }
      }
    });
  }

  _setHumanColor(color) {
    if (!this.aiEnabled || this.humanPlayer === color) return;
    this.humanPlayer = color;
    this.newGame();
  }

  handleMove(row, col) {
    if (this.state.gameOver || this.aiThinking) return;

    if (this.aiEnabled && this.state.currentPlayer !== this.humanPlayer) return;

    if (this.state.boardData[row][col] !== EMPTY) return;

    // Black forbidden moves: reject placement and ask for another cell
    if (
      this.forbiddenMoves &&
      this.state.currentPlayer === BLACK
    ) {
      const forbidden = ForbiddenChecker.check(this.state.boardData, row, col);
      if (forbidden) {
        this._rejectForbidden(row, col, forbidden.label);
        return;
      }
    }

    if (!this._applyMove(row, col)) return;

    if (this.state.gameOver) return;

    if (this.aiEnabled && this.state.currentPlayer === this.aiPlayer) {
      this._scheduleAiMove();
    }
  }

  _rejectForbidden(row, col, label) {
    this.board.flashForbidden(row, col);
    this.ui.showToast(`不能下这儿（${label}禁手），请换个位置`);
    this.ui.updateStatus(`禁手：${label} · 请重下`, 'warning');

    // Restore the normal turn indicator after the toast
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

  /**
   * Place stone, update board/UI, handle win/draw/turn switch.
   * Returns false if the move was illegal.
   */
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
    if (this.aiThinking) return;

    // In AI mode, undo the AI reply and the human move together
    const steps = this.aiEnabled ? 2 : 1;
    let undone = 0;

    for (let i = 0; i < steps; i++) {
      const lastMove = this.state.undoMove();
      if (!lastMove) break;
      this.board.removeStone(lastMove.row, lastMove.col);
      undone++;
    }

    if (undone === 0) return;

    // Ensure it's the human's turn after undo in AI mode
    if (this.aiEnabled && this.state.currentPlayer !== this.humanPlayer) {
      const extra = this.state.undoMove();
      if (extra) this.board.removeStone(extra.row, extra.col);
    }

    this.board.setDisabled(false);
    this._refreshUI();

    // Playing White: undoing the AI opening leaves an empty board on AI's turn
    if (
      this.aiEnabled &&
      !this.state.gameOver &&
      this.state.currentPlayer === this.aiPlayer
    ) {
      this._scheduleAiMove();
    }
  }

  newGame() {
    this._cancelAiTimer();
    this.state.resetGame();
    this.board.clearBoard();
    this._refreshUI();

    // If human chose White, AI (Black) opens the game
    if (this.aiEnabled && this.state.currentPlayer === this.aiPlayer) {
      this._scheduleAiMove();
    }
  }

  _endGame(winner) {
    this._cancelAiTimer();
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
    this.ui.updateHistory(this.state.moveHistory, this.aiEnabled, this.aiPlayer);
    this.ui.setUndoEnabled(this._canUndo());
  }

  _refreshUI() {
    const { currentPlayer, gameOver, moveHistory, scores } = this.state;

    this.ui.updateScores(scores);
    this.ui.updateScoreLabels(this.aiEnabled, this.humanPlayer);
    this.ui.updateAiControls(this.aiEnabled, this.ai.difficulty, this.humanPlayer);
    this.ui.updateForbiddenControls(this.forbiddenMoves);
    this.ui.updateHistory(moveHistory, this.aiEnabled, this.aiPlayer);

    if (gameOver || this.aiThinking) {
      this.ui.setUndoEnabled(!this.aiThinking && this._canUndo());
      return;
    }

    let statusText = `${PLAYER_NAMES[currentPlayer]}'s Turn`;
    if (this.aiEnabled) {
      statusText =
        currentPlayer === this.humanPlayer ? 'Your Turn' : 'AI is thinking…';
    }

    this.ui.updateStatus(
      statusText,
      currentPlayer === BLACK ? 'black' : 'white'
    );

    this.ui.setUndoEnabled(this._canUndo());
    this.board.setDisabled(false);
  }

  /** Undo is available once the human has placed at least one stone. */
  _canUndo() {
    if (this.state.moveHistory.length === 0) return false;
    if (!this.aiEnabled) return true;
    return this.state.moveHistory.some((move) => move.player === this.humanPlayer);
  }
}

/* ==========================================================================
   Initialize
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  new Game();
});
