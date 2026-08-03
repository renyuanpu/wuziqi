/**
 * Durable Object — one instance per room code.
 * Uses WebSocket hibernation for free-tier friendly online play.
 */

import { DurableObject } from 'cloudflare:workers';
import {
  BOARD_SIZE,
  EMPTY,
  BLACK,
  WHITE,
  WinChecker,
  ForbiddenChecker,
  createEmptyBoard,
  isBoardFull,
} from './game-logic.js';

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.roomCode = null;
    this.board = createEmptyBoard();
    this.currentPlayer = BLACK;
    this.moveHistory = [];
    this.gameOver = false;
    this.winner = null;
    this.started = false;
    this.forbiddenMoves = true;
    /** @type {null | { fromId: string }} */
    this.undoPending = null;
    /** @type {null | { fromId: string }} */
    this.newGamePending = null;
    this._ready = this._loadState();
  }

  async _loadState() {
    const saved = await this.ctx.storage.get('game');
    if (!saved) return;
    this.roomCode = saved.roomCode ?? null;
    this.board = saved.board ?? createEmptyBoard();
    this.currentPlayer = saved.currentPlayer ?? BLACK;
    this.moveHistory = saved.moveHistory ?? [];
    this.gameOver = Boolean(saved.gameOver);
    this.winner = saved.winner ?? null;
    this.started = Boolean(saved.started);
    this.forbiddenMoves = true;
    this.undoPending = saved.undoPending ?? null;
    this.newGamePending = saved.newGamePending ?? null;
  }

  async _saveState() {
    await this.ctx.storage.put('game', {
      roomCode: this.roomCode,
      board: this.board,
      currentPlayer: this.currentPlayer,
      moveHistory: this.moveHistory,
      gameOver: this.gameOver,
      winner: this.winner,
      started: this.started,
      undoPending: this.undoPending,
      newGamePending: this.newGamePending,
    });
  }

  async fetch(request) {
    await this._ready;

    const url = new URL(request.url);
    const roomCode = (url.searchParams.get('room') || '').toUpperCase();
    this.roomCode = roomCode;

    const upgrade = request.headers.get('Upgrade');
    if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= 2) {
      return new Response('Room full', { status: 503 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);

    const playerId = crypto.randomUUID();
    server.serializeAttachment({ id: playerId, color: 0 });

    const connected = this.ctx.getWebSockets();
    if (connected.length === 1) {
      this.started = false;
      this._resetBoardFields();
      await this._saveState();
      this._send(server, { type: 'waiting', roomCode });
    } else if (connected.length === 2) {
      await this._startGame();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    await this._ready;

    let msg;
    try {
      msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      this._send(ws, { type: 'error', message: 'Invalid message' });
      return;
    }

    switch (msg.type) {
      case 'leave':
        try {
          ws.close(1000, 'leave');
        } catch {
          /* ignore */
        }
        break;
      case 'move':
        await this._handleMove(ws, msg.row, msg.col);
        break;
      case 'undo_request':
        await this._handleUndoRequest(ws);
        break;
      case 'undo_response':
        await this._handleUndoResponse(ws, Boolean(msg.accepted));
        break;
      case 'new_game_request':
        await this._handleNewGameRequest(ws);
        break;
      case 'new_game_response':
        await this._handleNewGameResponse(ws, Boolean(msg.accepted));
        break;
      default:
        this._send(ws, { type: 'error', message: 'Unknown message type' });
    }
  }

  async webSocketClose(ws) {
    await this._ready;
    await this._handleDisconnect(ws);
  }

  async webSocketError(ws) {
    await this._ready;
    await this._handleDisconnect(ws);
  }

  _attachment(ws) {
    return ws.deserializeAttachment() || { id: null, color: 0 };
  }

  _setAttachment(ws, data) {
    ws.serializeAttachment(data);
  }

  _send(ws, msg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* closed */
    }
  }

  _broadcast(msg, except = null) {
    const data = JSON.stringify(msg);
    for (const client of this.ctx.getWebSockets()) {
      if (client !== except) {
        try {
          client.send(data);
        } catch {
          /* ignore */
        }
      }
    }
  }

  _getPeer(ws) {
    for (const client of this.ctx.getWebSockets()) {
      if (client !== ws) return client;
    }
    return null;
  }

  _resetBoardFields() {
    this.board = createEmptyBoard();
    this.currentPlayer = BLACK;
    this.moveHistory = [];
    this.gameOver = false;
    this.winner = null;
    this.undoPending = null;
    this.newGamePending = null;
  }

  async _startGame() {
    this._resetBoardFields();
    this.started = true;

    const sockets = this.ctx.getWebSockets();
    if (sockets.length !== 2) return;

    const firstIsBlack = Math.random() < 0.5;
    const colors = firstIsBlack ? [BLACK, WHITE] : [WHITE, BLACK];

    sockets.forEach((socket, index) => {
      const prev = this._attachment(socket);
      this._setAttachment(socket, { id: prev.id, color: colors[index] });
      this._send(socket, {
        type: 'start',
        roomCode: this.roomCode,
        color: colors[index],
        forbiddenMoves: true,
        currentPlayer: BLACK,
      });
    });

    await this._saveState();
  }

  async _handleDisconnect(ws) {
    const peers = this.ctx.getWebSockets().filter((s) => s !== ws);
    this.undoPending = null;
    this.newGamePending = null;
    this.started = false;
    this._resetBoardFields();
    await this._saveState();

    for (const peer of peers) {
      this._send(peer, { type: 'peer_left', message: '对方已离开房间' });
      try {
        peer.close(1000, 'peer_left');
      } catch {
        /* ignore */
      }
    }
  }

  async _handleMove(ws, row, col) {
    if (!this.started) {
      this._send(ws, { type: 'reject', reason: 'not_in_game', message: '对局尚未开始' });
      return;
    }
    if (this.gameOver) {
      this._send(ws, { type: 'reject', reason: 'game_over', message: '对局已结束' });
      return;
    }
    if (this.undoPending || this.newGamePending) {
      this._send(ws, { type: 'reject', reason: 'pending', message: '请先处理进行中的请求' });
      return;
    }

    const { color } = this._attachment(ws);
    if (color !== this.currentPlayer) {
      this._send(ws, { type: 'reject', reason: 'not_your_turn', message: '还没轮到你' });
      return;
    }

    if (
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      row >= BOARD_SIZE ||
      col < 0 ||
      col >= BOARD_SIZE
    ) {
      this._send(ws, { type: 'reject', reason: 'invalid', message: '坐标无效' });
      return;
    }

    if (this.board[row][col] !== EMPTY) {
      this._send(ws, { type: 'reject', reason: 'occupied', message: '此处已有棋子' });
      return;
    }

    if (color === BLACK && this.forbiddenMoves) {
      const forbidden = ForbiddenChecker.check(this.board, row, col);
      if (forbidden) {
        this._send(ws, {
          type: 'reject',
          reason: 'forbidden',
          label: forbidden.label,
          message: `不能下这儿（${forbidden.label}禁手）`,
          row,
          col,
        });
        return;
      }
    }

    this.board[row][col] = color;
    this.moveHistory.push({ row, col, player: color });

    let winner = null;
    let draw = false;

    if (
      WinChecker.checkWinner(this.board, row, col, color, {
        forbidBlackOverline: this.forbiddenMoves,
      })
    ) {
      this.gameOver = true;
      this.winner = color;
      winner = color;
    } else if (isBoardFull(this.board)) {
      this.gameOver = true;
      draw = true;
    } else {
      this.currentPlayer = color === BLACK ? WHITE : BLACK;
    }

    this._broadcast({
      type: 'move',
      row,
      col,
      player: color,
      currentPlayer: this.currentPlayer,
      gameOver: this.gameOver,
      winner,
      draw,
    });

    await this._saveState();
  }

  async _handleUndoRequest(ws) {
    if (!this.started) {
      this._send(ws, { type: 'error', message: '对局尚未开始' });
      return;
    }
    if (this.moveHistory.length === 0) {
      this._send(ws, { type: 'error', message: '没有可悔的棋' });
      return;
    }
    if (this.undoPending || this.newGamePending) {
      this._send(ws, { type: 'error', message: '已有请求等待处理' });
      return;
    }

    const peer = this._getPeer(ws);
    if (!peer) {
      this._send(ws, { type: 'error', message: '对手不在线' });
      return;
    }

    this.undoPending = { fromId: this._attachment(ws).id };
    this._send(ws, { type: 'undo_waiting' });
    this._send(peer, { type: 'undo_request' });
    await this._saveState();
  }

  async _handleUndoResponse(ws, accepted) {
    if (!this.undoPending) {
      this._send(ws, { type: 'error', message: '没有待处理的悔棋请求' });
      return;
    }
    if (this.undoPending.fromId === this._attachment(ws).id) {
      this._send(ws, { type: 'error', message: '不能回应自己的请求' });
      return;
    }

    this.undoPending = null;

    if (!accepted) {
      this._broadcast({ type: 'undo_result', accepted: false });
      await this._saveState();
      return;
    }

    if (this.moveHistory.length === 0) {
      this._broadcast({ type: 'undo_result', accepted: false, message: '没有可悔的棋' });
      await this._saveState();
      return;
    }

    const last = this.moveHistory.pop();
    this.board[last.row][last.col] = EMPTY;
    this.gameOver = false;
    this.winner = null;
    this.currentPlayer = last.player;

    this._broadcast({
      type: 'undo_result',
      accepted: true,
      row: last.row,
      col: last.col,
      currentPlayer: this.currentPlayer,
    });

    await this._saveState();
  }

  async _handleNewGameRequest(ws) {
    if (!this.started) {
      this._send(ws, { type: 'error', message: '对局尚未开始' });
      return;
    }
    if (this.undoPending || this.newGamePending) {
      this._send(ws, { type: 'error', message: '已有请求等待处理' });
      return;
    }

    const peer = this._getPeer(ws);
    if (!peer) {
      this._send(ws, { type: 'error', message: '对手不在线' });
      return;
    }

    if (this.moveHistory.length === 0 && !this.gameOver) {
      await this._startGame();
      return;
    }

    this.newGamePending = { fromId: this._attachment(ws).id };
    this._send(ws, { type: 'new_game_waiting' });
    this._send(peer, { type: 'new_game_request' });
    await this._saveState();
  }

  async _handleNewGameResponse(ws, accepted) {
    if (!this.newGamePending) {
      this._send(ws, { type: 'error', message: '没有待处理的重开请求' });
      return;
    }
    if (this.newGamePending.fromId === this._attachment(ws).id) {
      this._send(ws, { type: 'error', message: '不能回应自己的请求' });
      return;
    }

    this.newGamePending = null;

    if (!accepted) {
      this._broadcast({ type: 'new_game_result', accepted: false });
      await this._saveState();
      return;
    }

    await this._startGame();
  }
}
