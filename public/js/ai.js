/**
 * Gomoku AI — threat-based evaluation with difficulty tiers.
 */

import {
  BOARD_SIZE,
  EMPTY,
  BLACK,
  WHITE,
  DIRECTIONS,
  WinChecker,
} from './core.js';
import { ForbiddenChecker } from './forbidden.js';

export const DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard',
};

/** Pattern scores for attack; defense uses a slightly lower weight. */
const SCORES = {
  WIN: 100000,
  OPEN_FOUR: 15000,
  FOUR: 4000,
  OPEN_THREE: 2000,
  THREE: 400,
  OPEN_TWO: 120,
  TWO: 40,
  ONE: 10,
};

const DIFFICULTY_CONFIG = {
  [DIFFICULTY.EASY]: {
    winChance: 0.35,
    blockChance: 0.25,
    noise: 0.55,
    thinkMs: [200, 450],
  },
  [DIFFICULTY.MEDIUM]: {
    winChance: 1,
    blockChance: 1,
    noise: 0.18,
    thinkMs: [280, 520],
  },
  [DIFFICULTY.HARD]: {
    winChance: 1,
    blockChance: 1,
    noise: 0,
    thinkMs: [350, 650],
  },
};

export class AIPlayer {
  constructor(difficulty = DIFFICULTY.MEDIUM) {
    this.difficulty = difficulty;
    this.forbiddenMoves = false;
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty;
  }

  setForbiddenMoves(enabled) {
    this.forbiddenMoves = enabled;
  }

  getThinkDelay() {
    const [min, max] = DIFFICULTY_CONFIG[this.difficulty].thinkMs;
    return min + Math.random() * (max - min);
  }

  /**
   * Suggest a move for hints (deterministic, no randomness).
   */
  getHintMove(board, player) {
    const candidates = this._legalCandidates(board, player);
    if (candidates.length === 0) return null;

    const human = player === BLACK ? WHITE : BLACK;
    const ranked = candidates
      .map((move) => ({
        ...move,
        score: this._evaluateMove(board, move.row, move.col, player, human, 1),
      }))
      .sort((a, b) => b.score - a.score);

    return this._pickStable(ranked.slice(0, 3));
  }

  /**
   * Choose the next AI move. Returns { row, col }.
   */
  getMove(board, aiPlayer) {
    const candidates = this._legalCandidates(board, aiPlayer);
    if (candidates.length === 0) {
      return { row: Math.floor(BOARD_SIZE / 2), col: Math.floor(BOARD_SIZE / 2) };
    }

    const human = aiPlayer === BLACK ? WHITE : BLACK;
    const config = DIFFICULTY_CONFIG[this.difficulty];

    // Immediate win
    const winningMoves = candidates.filter(({ row, col }) =>
      this._wouldWin(board, row, col, aiPlayer)
    );
    if (winningMoves.length > 0 && Math.random() < config.winChance) {
      return this._pickRandom(winningMoves);
    }

    // Block opponent win
    const blockingMoves = candidates.filter(({ row, col }) =>
      this._wouldWin(board, row, col, human)
    );
    if (blockingMoves.length > 0 && Math.random() < config.blockChance) {
      return this._pickRandom(blockingMoves);
    }

    if (this.difficulty === DIFFICULTY.EASY) {
      return this._easyPick(board, candidates, aiPlayer, human);
    }

    if (this.difficulty === DIFFICULTY.MEDIUM) {
      return this._scoredPick(board, candidates, aiPlayer, human, {
        defenseWeight: 0.85,
        topN: 3,
        noise: config.noise,
      });
    }

    return this._hardPick(board, candidates, aiPlayer, human);
  }

  _legalCandidates(board, player) {
    let candidates = this._getCandidates(board).filter((move) =>
      this._isLegal(board, move.row, move.col, player)
    );

    if (candidates.length === 0) {
      candidates = this._getCandidates(board, 3).filter((move) =>
        this._isLegal(board, move.row, move.col, player)
      );
    }

    if (candidates.length === 0) {
      candidates = this._allEmptyCells(board).filter((move) =>
        this._isLegal(board, move.row, move.col, player)
      );
    }

    return candidates;
  }

  _isLegal(board, row, col, player) {
    if (board[row][col] !== EMPTY) return false;
    if (player === BLACK && this.forbiddenMoves) {
      return !ForbiddenChecker.isForbidden(board, row, col);
    }
    return true;
  }

  /* -------------------------------------------------------------------------- */

  _easyPick(board, candidates, aiPlayer, human) {
    if (Math.random() < 0.4) {
      return this._scoredPick(board, candidates, aiPlayer, human, {
        defenseWeight: 0.6,
        topN: 8,
        noise: 0.7,
      });
    }
    return this._pickRandom(candidates);
  }

  _hardPick(board, candidates, aiPlayer, human) {
    let bestScore = -Infinity;
    let bestMoves = [];

    for (const move of candidates) {
      let score = this._evaluateMove(board, move.row, move.col, aiPlayer, human, 1);

      // One-ply: penalize leaving an immediate opponent win
      board[move.row][move.col] = aiPlayer;
      const replyCandidates = this._getCandidates(board);
      const opponentCanWin = replyCandidates.some(({ row, col }) =>
        this._wouldWin(board, row, col, human)
      );
      if (opponentCanWin) {
        score -= SCORES.WIN;
      } else {
        const ourThreats = replyCandidates.filter(({ row, col }) =>
          this._wouldWin(board, row, col, aiPlayer)
        ).length;
        if (ourThreats >= 2) score += SCORES.OPEN_FOUR;
        else if (ourThreats === 1) score += SCORES.FOUR * 0.5;
      }
      board[move.row][move.col] = EMPTY;

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
    }

    return this._pickRandom(bestMoves);
  }

  _scoredPick(board, candidates, aiPlayer, human, { defenseWeight, topN, noise }) {
    const ranked = candidates
      .map((move) => ({
        ...move,
        score: this._evaluateMove(
          board,
          move.row,
          move.col,
          aiPlayer,
          human,
          defenseWeight
        ),
      }))
      .sort((a, b) => b.score - a.score);

    const poolSize = Math.min(topN, ranked.length);
    let pool = ranked.slice(0, poolSize);

    if (noise > 0 && Math.random() < noise) {
      const wider = Math.min(
        ranked.length,
        Math.max(poolSize, Math.ceil(ranked.length * 0.35))
      );
      pool = ranked.slice(0, wider);
    }

    return this._pickRandom(pool);
  }

  _evaluateMove(board, row, col, aiPlayer, human, defenseWeight) {
    const attack = this._scorePlacement(board, row, col, aiPlayer);
    const defense = this._scorePlacement(board, row, col, human);
    const centerBias =
      (BOARD_SIZE / 2 - Math.abs(row - (BOARD_SIZE - 1) / 2)) +
      (BOARD_SIZE / 2 - Math.abs(col - (BOARD_SIZE - 1) / 2));

    return attack + defense * defenseWeight + centerBias * 0.5;
  }

  _scorePlacement(board, row, col, player) {
    if (this._wouldWin(board, row, col, player)) {
      return SCORES.WIN;
    }

    let total = 0;
    for (const [dr, dc] of DIRECTIONS) {
      const line = this._analyzeLine(board, row, col, dr, dc, player);
      total += this._lineScore(line);
    }
    return total;
  }

  _analyzeLine(board, row, col, dr, dc, player) {
    let count = 1;
    let openEnds = 0;

    let r = row + dr;
    let c = col + dc;
    while (
      r >= 0 && r < BOARD_SIZE &&
      c >= 0 && c < BOARD_SIZE &&
      board[r][c] === player
    ) {
      count++;
      r += dr;
      c += dc;
    }
    if (
      r >= 0 && r < BOARD_SIZE &&
      c >= 0 && c < BOARD_SIZE &&
      board[r][c] === EMPTY
    ) {
      openEnds++;
    }

    r = row - dr;
    c = col - dc;
    while (
      r >= 0 && r < BOARD_SIZE &&
      c >= 0 && c < BOARD_SIZE &&
      board[r][c] === player
    ) {
      count++;
      r -= dr;
      c -= dc;
    }
    if (
      r >= 0 && r < BOARD_SIZE &&
      c >= 0 && c < BOARD_SIZE &&
      board[r][c] === EMPTY
    ) {
      openEnds++;
    }

    return { count, openEnds };
  }

  _lineScore({ count, openEnds }) {
    if (openEnds === 0) return 0;

    if (count >= 5) return SCORES.WIN;
    if (count === 4) return openEnds === 2 ? SCORES.OPEN_FOUR : SCORES.FOUR;
    if (count === 3) return openEnds === 2 ? SCORES.OPEN_THREE : SCORES.THREE;
    if (count === 2) return openEnds === 2 ? SCORES.OPEN_TWO : SCORES.TWO;
    if (count === 1) return SCORES.ONE;
    return 0;
  }

  _wouldWin(board, row, col, player) {
    if (board[row][col] !== EMPTY) return false;
    if (player === BLACK && this.forbiddenMoves && ForbiddenChecker.isForbidden(board, row, col)) {
      return false;
    }
    board[row][col] = player;
    const won = WinChecker.checkWinner(board, row, col, player, {
      forbidBlackOverline: this.forbiddenMoves,
    });
    board[row][col] = EMPTY;
    return won;
  }

  /** Restrict search to empty cells near existing stones. */
  _getCandidates(board, radius = 2) {
    const hasStone = board.some((row) => row.some((cell) => cell !== EMPTY));
    if (!hasStone) {
      const mid = Math.floor(BOARD_SIZE / 2);
      return [{ row: mid, col: mid }];
    }

    const seen = new Set();
    const candidates = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] === EMPTY) continue;

        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const r = row + dr;
            const c = col + dc;
            if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
            if (board[r][c] !== EMPTY) continue;

            const key = `${r},${c}`;
            if (seen.has(key)) continue;
            seen.add(key);
            candidates.push({ row: r, col: c });
          }
        }
      }
    }

    return candidates;
  }

  _allEmptyCells(board) {
    const cells = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col] === EMPTY) cells.push({ row, col });
      }
    }
    return cells;
  }

  _pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Prefer center-most cell for stable hints when scores tie. */
  _pickStable(list) {
    if (list.length === 0) return null;
    const mid = (BOARD_SIZE - 1) / 2;
    return [...list].sort((a, b) => {
      const da = Math.abs(a.row - mid) + Math.abs(a.col - mid);
      const db = Math.abs(b.row - mid) + Math.abs(b.col - mid);
      if (da !== db) return da - db;
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    })[0];
  }
}
