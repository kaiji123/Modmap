# ModMap
Local-first Twitch moderation graph, built during the hackathon.
- One TypeScript repo: React/Vite client, Express/Socket.IO server, shared domain types.
- TypeScript strict. Keep pure scoring logic in shared/engine.ts.
- Never log tokens or send secrets to the browser. Ignore .env and runtime data.
- All messages use {id,userId,userName,text,replyToUserId,mentions,ts,simulated}.
- Simulator and future Twitch adapter must use the same ingest function.
- Simulated identities must never reach real Twitch moderation endpoints.
- Run: npm install; npm run dev. Check: npm test; npm run build.
- Do not claim live Twitch or AI integration until implemented and verified.
