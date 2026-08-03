/**
 * Gomoku rules for Cloudflare Worker / Durable Object.
 */

export const BOARD_SIZE = 15;
export const WIN_LENGTH = 5;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

const FORBIDDEN_LABELS = {
  overline: '长连',
  'double-four': '四四',
  'double-three': '三三',
};

export class WinChecker {
  static checkWinner(board, row, col, player, options = {}) {
    const { forbidBlackOverline = false } = options;

    for (const [dr, dc] of DIRECTIONS) {
      let count = 1;
      count += this._countInDirection(board, row, col, dr, dc, player);
      count += this._countInDirection(board, row, col, -dr, -dc, player);

      if (count === WIN_LENGTH) return true;
      if (count > WIN_LENGTH) {
        if (forbidBlackOverline && player === BLACK) continue;
        return true;
      }
    }
    return false;
  }

  static _countInDirection(board, row, col, dr, dc, player) {
    let count = 0;
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
    return count;
  }
}

export class ForbiddenChecker {
  static check(board, row, col) {
    if (board[row][col] !== EMPTY) return null;

    board[row][col] = BLACK;

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

  static _hasExactFive(board, row, col) {
    for (const [dr, dc] of DIRECTIONS) {
      const count =
        1 +
        this._countDir(board, row, col, dr, dc) +
        this._countDir(board, row, col, -dr, -dc);
      if (count === 5) return true;
    }
    return false;
  }

  static _hasOverline(board, row, col) {
    for (const [dr, dc] of DIRECTIONS) {
      const count =
        1 +
        this._countDir(board, row, col, dr, dc) +
        this._countDir(board, row, col, -dr, -dc);
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

  static _classifyDirection(board, row, col, dr, dc) {
    const line = this._buildLine(board, row, col, dr, dc);
    if (this._isFour(line)) return 'four';
    if (this._isOpenThree(line)) return 'open_three';
    return null;
  }

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

  static _isFour(line) {
    for (let start = 1; start <= 5; start++) {
      const window = line.slice(start, start + 5);
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

  static _isOpenThree(line) {
    const patterns = ['_XXX_', '_XX_X_', '_X_XX_'];
    for (const pattern of patterns) {
      if (this._centerIncludesPattern(line, pattern)) return true;
    }
    return false;
  }

  static _centerIncludesPattern(line, pattern) {
    const center = 5;
    for (let i = 0; i <= line.length - pattern.length; i++) {
      if (line.slice(i, i + pattern.length) !== pattern) continue;
      if (i <= center && center < i + pattern.length) {
        if (pattern[center - i] === 'X') return true;
      }
    }
    return false;
  }
}

export function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(EMPTY));
}

export function isBoardFull(board) {
  return board.every((row) => row.every((cell) => cell !== EMPTY));
}

export function normalizeRoomCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function isValidRoomCode(code) {
  return /^[A-Z0-9]{6}$/.test(code);
}
