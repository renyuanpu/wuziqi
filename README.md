# Gomoku

A minimalist Five-in-a-Row web game with local play, AI, and free online rooms on **Cloudflare Workers + Durable Objects**.

## Features

- 15×15 board, win / draw detection
- Local Human vs Human
- AI Mode (Easy / Medium / Hard) with color choice
- Optional Black forbidden moves (三三 / 四四 / 长连)
- Move hint (`H`)
- **Online Mode** — share a 6-character room code (Cloudflare edge)

## Online rules

- Forbidden moves always on
- Black / White assigned randomly
- Undo and New Game need opponent approval

## Local development

Requires a free [Cloudflare](https://dash.cloudflare.com/sign-up) account (for Durable Objects in `wrangler dev`).

```bash
npm install
npx wrangler login
npm run dev
```

Open the URL Wrangler prints (usually `http://127.0.0.1:8787`).

1. Enable **Online Mode**
2. **Generate** a room code
3. Open a second browser / private window → same code → **Join Room**

Offline AI / local PvP also works from that URL without joining a room.

## Deploy (play with remote friends — free)

```bash
npm install
npx wrangler login
npm run deploy
```

Wrangler will print a URL like:

```text
https://gomoku.<your-subdomain>.workers.dev
```

Send that link to your friend. Both open it, enable Online Mode, use the **same room code**.

### Custom domain (optional)

In Cloudflare Dashboard → Workers & Pages → your worker → **Triggers / Custom Domains**, attach a domain you already manage on Cloudflare.

## Project structure

```
/
├── public/             # frontend (Pages/Assets)
│   ├── index.html
│   ├── css/
│   └── js/
├── worker/             # Cloudflare Worker + Durable Object
│   ├── index.js
│   ├── room.js
│   └── game-logic.js
├── wrangler.toml
└── package.json
```


## Keyboard

| Key | Action |
|-----|--------|
| `R` | New game / request rematch (online) |
| `H` | Hint |

## Notes

- Online rooms use Durable Object WebSocket hibernation (friendly to the free tier)
- Disconnecting ends the current room for both players
- Free plan daily limits apply; casual play is usually fine
