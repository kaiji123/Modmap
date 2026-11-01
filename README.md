# ModMap
**Word filters see messages; ModMap sees the mob.**

A local-first prototype for visualising directed Twitch chat interactions and detecting possible coordinated targeting. Built for the Codex x TwitchCon hackathon.

## Run
Node 20.19+ required.

```sh
npm install
npm run dev
```

Open http://localhost:3000. No credentials required. Press **Run raid simulation**: 25 labelled messages enter the server's shared ingest function over 20 seconds. After five distinct senders converge on Kai, an evidence-backed alert appears. Click a node to inspect message history. Flagged originals are withheld from snapshots and retrieved only on reveal; unique reveals are counted in server memory. Reset stops the simulation and restores friendly sample chat.

```sh
npm test
npm run build
npm start
```

After building, `npm start` serves the production app at http://127.0.0.1:3001.

## Current milestone
- React/TypeScript responsive dark dashboard, directed SVG graph, nodes sized by message count and coloured by rolling word-filter score.
- Express/Socket.IO server, 2-minute window, message deduplication and shared ingest boundary.
- Heuristic normalisation and word list, whole-message masking, server-side original reveal.
- Target-based detector: at least 5 distinct senders in 30 seconds, flagged messages, and at least 50% of cross-sender pairs with token Jaccard similarity above 0.7.
- Simulation evidence is separated from real evidence. No Twitch moderation endpoints exist in this milestone.

## Limits and next steps
This is a simulation prototype, not a finished Twitch integration. No OAuth, EventSub, OpenAI scoring, account-age lookup, Louvain, or real moderation actions yet. Scores are heuristic signals and do not establish abuse or intent. Current graph uses a deterministic radial layout. State and reveal counts reset on server restart. The local socket server has no authentication; it binds to loopback and must not be publicly exposed as-is.

Next: server-side Twitch OAuth and EventSub adapter into the existing ingest function, then one real timeout action restricted to authenticated moderators and non-simulated users. Add secure sessions, CSRF protection, token storage and retention controls before deployment. Keep keys server-only. `.env.example` intentionally contains no secrets.

## Layout
`server/` transport and simulator; `shared/` event types, scoring and detector; `src/` dashboard. `AGENTS.md` contains development constraints. `SUBMISSION.md` tracks Codex work.

For the end-to-end smoke check, keep `npm run dev` running and execute `node scripts/smoke.mjs` in another terminal. This resets the demo and runs a short simulated raid.
