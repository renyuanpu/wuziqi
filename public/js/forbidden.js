/**
 * Renju-style forbidden moves for Black:
 * - 长连 (overline): 6+ in a row
 * - 四四 (double four): two or more fours in one move
 * - 三三 (double three): two or more open threes in one move
 *
 * Exact five (五连) always wins and is never treated as forbidden.
 */

import { BOARD_SIZE, EMPTY, BLACK, DIRECTIONS } from './core.js';

export const FORBIDDEN_LABELS = {
  overline: '长连',
  'double-four': '四四',
  'double-three': '三三',
};

export class ForbiddenChecker {
  /**
   * @returns {null | { type: string, label: string }}
   */
  static check(board, row, col) {
    if (board[row][col] !== EMPTY) return null;

    board[row][col] = BLACK;

    // Exact five wins — not a forbidden move
    if (this._hasExactFive(board, row, col)) {
      board[row][col] = EMPTY;
      return null;
    }

    if (this._hasOverline(board, row, col)) {
      board[row][col] = EMPTY;
      return { type: 'overline', label: FORBIDDEN_LABELS.overline };
    }

    let fours = 0;
    let openThrees = 0;

    for (const [dr, dc] of DIRECTIONS) {
      const shape = this._classifyDirection(board, row, col, dr, dc);
      if (shape === 'four') fours++;
      else if (shape === 'open_three') openThrees++;
    }

    board[row][col] = EMPTY;

    if (fours >= 2) {
      return { type: 'double-four', label: FORBIDDEN_LABELS['double-four'] };
    }
    if (openThrees >= 2) {
      return { type: 'double-three', label: FORBIDDEN_LABELS['double-three'] };
    }

    return null;
  }

  static isForbidden(board, row, col) {
    return this.check(board, row, col) !== null;
  }

  /* -------------------------------------------------------------------------- */

  static _hasExactFive(board, row, col) {
    for (const [dr, dc] of DIRECTIONS) {
      const count = 1
        + this._countDir(board, row, col, dr, dc)
        + this._countDir(board, row, col, -dr, -dc);
      if (count === 5) return true;
    }
    return false;
  }

  static _hasOverline(board, row, col) {
    for (const [dr, dc] of DIRECTIONS) {
      const count = 1
        + this._countDir(board, row, col, dr, dc)
        + this._countDir(board, row, col, -dr, -dc);
      if (count >= 6) return true;
    }
    return false;
  }

  static _countDir(board, row, col, dr, dc) {
    let count = 0;
    let r = row + dr;
    let c = col + dc;
    while (
      r >= 0 && r < BOARD_SIZE &&
      c >= 0 && c < BOARD_SIZE &&
      board[r][c] === BLACK
    ) {
      count++;
      r += dr;
      c += dc;
    }
    return count;
  }

  /**
   * Classify the threat created on one axis through (row, col).
   * Stone must already be placed.
   */
  static _classifyDirection(board, row, col, dr, dc) {
    const line = this._buildLine(board, row, col, dr, dc);

    if (this._isFour(line)) return 'four';
    if (this._isOpenThree(line)) return 'open_three';
    return null;
  }

  /** Build a length-11 string centered on the move: X black, _ empty, O block. */
  static _buildLine(board, row, col, dr, dc) {
    const cells = [];
    for (let i = -5; i <= 5; i++) {
      const r = row + i * dr;
      const c = col + i * dc;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) {
        cells.push('O');
      } else if (board[r][c] === BLACK) {
        cells.push('X');
      } else if (board[r][c] === EMPTY) {
        cells.push('_');
      } else {
        cells.push('O');
      }
    }
    return cells.join('');
  }

  /**
   * Four (冲四 / 活四): a 5-cell window containing the center with 4 X and 1 _.
   */
  static _isFour(line) {
    // Center is at index 5 in length-11 string
    for (let start = 1; start <= 5; start++) {
      const window = line.slice(start, start + 5);
      if (!window.includes('X')) continue;
      // Window must include center (index 5)
      if (start > 5 || start + 4 < 5) continue;

      let x = 0;
      let empty = 0;
      let blocked = false;
      for (const ch of window) {
        if (ch === 'X') x++;
        else if (ch === '_') empty++;
        else blocked = true;
      }
      if (!blocked && x === 4 && empty === 1) return true;
    }
    return false;
  }

  /**
   * Open three (活三): can become an open four on the next move.
   * Detected via common live patterns that include the center stone.
   */
  static _isOpenThree(line) {
    const patterns = [
      '_XXX_',
      '_XX_X_',
      '_X_XX_',
    ];

    for (const pattern of patterns) {
      if (this._centerIncludesPattern(line, pattern)) {
        // Exclude cases that are already fours (handled earlier), and
        // half-blocked lookalikes are rejected by requiring both flanks open
        // inside the pattern itself.
        return true;
      }
    }
    return false;
  }

  /** True if `pattern` occurs in `line` and covers the center index (5). */
  static _centerIncludesPattern(line, pattern) {
    const center = 5;
    for (let i = 0; i <= line.length - pattern.length; i++) {
      if (line.slice(i, i + pattern.length) !== pattern) continue;
      if (i <= center && center < i + pattern.length) {
        // Center cell in the pattern must be a stone
        if (pattern[center - i] === 'X') return true;
      }
    }
    return false;
  }
}
