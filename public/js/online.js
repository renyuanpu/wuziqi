/**
 * Online multiplayer client — Cloudflare Durable Object WebSocket rooms.
 */

export function generateRoomCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    code += alphabet[values[i] % alphabet.length];
  }
  return code;
}

export function normalizeRoomCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function wsBaseUrl() {
  const { protocol, hostname, port } = window.location;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

  if (!hostname || protocol === 'file:') {
    return 'ws://127.0.0.1:8787';
  }

  const hostPort = port ? `${hostname}:${port}` : hostname;
  return `${wsProtocol}//${hostPort}`;
}

export class OnlineClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.ws = null;
    this.roomCode = null;
    this.connected = false;
    this._intentionalClose = false;
  }

  /**
   * Connect directly into a room (Durable Object idFromName).
   * Opening the socket = joining the room.
   */
  connect(roomCode) {
    const code = normalizeRoomCode(roomCode);
    if (code.length !== 6) {
      this.handlers.onError?.('房间码需为 6 位字母或数字');
      return;
    }

    this.disconnect(false);
    this._intentionalClose = false;
    this.roomCode = code;

    const url = `${wsBaseUrl()}/ws?room=${encodeURIComponent(code)}`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener('open', () => {
      this.connected = true;
      this.handlers.onOpen?.();
    });

    this.ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      this._dispatch(msg);
    });

    this.ws.addEventListener('close', () => {
      this.connected = false;
      this.roomCode = null;
      if (this._intentionalClose) {
        this._intentionalClose = false;
        return;
      }
      this.handlers.onClose?.();
    });

    this.ws.addEventListener('error', () => {
      this.handlers.onError?.(
        '无法连接联机服务。请用 npm run dev 本地调试，或部署到 Cloudflare 后访问线上地址。'
      );
    });
  }

  disconnect(notifyLeft = false) {
    this._intentionalClose = true;
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'leave' }));
        }
      } catch {
        /* ignore */
      }
      try {
        this.ws.close(1000, 'leave');
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.connected = false;
    this.roomCode = null;
    if (notifyLeft) this.handlers.onLeft?.();
  }

  join(roomCode) {
    this.connect(roomCode);
  }

  leave() {
    this.disconnect(true);
  }

  sendMove(row, col) {
    this._send({ type: 'move', row, col });
  }

  requestUndo() {
    this._send({ type: 'undo_request' });
  }

  respondUndo(accepted) {
    this._send({ type: 'undo_response', accepted });
  }

  requestNewGame() {
    this._send({ type: 'new_game_request' });
  }

  respondNewGame(accepted) {
    this._send({ type: 'new_game_response', accepted });
  }

  _send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.handlers.onError?.('尚未连接到房间');
      return;
    }
    this.ws.send(JSON.stringify(msg));
  }

  _dispatch(msg) {
    if (msg.type === 'peer_left') {
      this._intentionalClose = true;
    }

    const map = {
      waiting: 'onWaiting',
      start: 'onStart',
      move: 'onMove',
      reject: 'onReject',
      undo_waiting: 'onUndoWaiting',
      undo_request: 'onUndoRequest',
      undo_result: 'onUndoResult',
      new_game_waiting: 'onNewGameWaiting',
      new_game_request: 'onNewGameRequest',
      new_game_result: 'onNewGameResult',
      peer_left: 'onPeerLeft',
      left: 'onLeft',
      error: 'onError',
    };

    const handlerName = map[msg.type];
    if (handlerName && this.handlers[handlerName]) {
      if (msg.type === 'error') {
        this.handlers.onError(msg.message || '未知错误');
      } else {
        this.handlers[handlerName](msg);
      }
      return;
    }

    if (msg.type === 'error') {
      this.handlers.onError?.(msg.message || '未知错误');
    }
  }
}
