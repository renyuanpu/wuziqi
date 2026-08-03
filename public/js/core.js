/**
 * Shared constants and win-detection for Gomoku.
 */

export const BOARD_SIZE = 15;
export const WIN_LENGTH = 5;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export const PLAYER_NAMES = {
  [BLACK]: 'Black',
  [WHITE]: 'White',
};

/** Direction vectors for win detection: [dr, dc] */
export const DIRECTIONS = [
  [0, 1],   // horizontal
  [1, 0],   // vertical
  [1, 1],   // diagonal \
  [1, -1],  // diagonal /
];

export class WinChecker {
  /**
   * Check if placing a stone at (row, col) creates a winning line.
   * Only scans outward from the last move in 4 directions — O(1) per move.
   *
   * @param {{ forbidBlackOverline?: boolean }} [options]
   *        When true, Black overlines (6+) do not count as a win.
   */
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

  /** Count consecutive stones in one direction from (row, col), excluding the origin. */
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
