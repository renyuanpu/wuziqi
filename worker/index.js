/**
 * Cloudflare Worker entry — static assets + WebSocket room routing.
 */

import { GameRoom } from './room.js';
import { isValidRoomCode, normalizeRoomCode } from './game-logic.js';

export { GameRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      const upgrade = request.headers.get('Upgrade');
      if (!upgrade || upgrade.toLowerCase() !== 'websocket') {
        return new Response('Expected WebSocket upgrade', { status: 426 });
      }

      const roomCode = normalizeRoomCode(url.searchParams.get('room'));
      if (!isValidRoomCode(roomCode)) {
        return new Response('Invalid room code', { status: 400 });
      }

      const id = env.GAME_ROOM.idFromName(roomCode);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    // Static frontend (Workers Assets)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
