# ModMap
**Word filters see messages; ModMap sees the mob.**

A local-first prototype for visualising directed Twitch chat interactions and detecting possible coordinated targeting, with Twitch OAuth and EventSub chat ingestion. Built for the Codex x TwitchCon hackathon.

## Run
Node 20.19+ required.

```sh
npm install
npm run dev
```

Open http://localhost:3000. No credentials required. Press **Run raid simulation**: 42 labelled messages enter the server's shared ingest function over about 34 seconds, mixing two hostile groups, several targets, cross-group attacks and friendly replies. After five distinct senders converge on Kai, an evidence-backed alert appears. Click a node to inspect message history and its incoming/outgoing interactions. Each message shows its reply and mention targets. Flagged originals are withheld from snapshots and retrieved only on reveal; unique reveals are counted in server memory. Reset stops the simulation and restores friendly sample chat.

```sh
npm test
npm run build
npm start
```

After building, `npm start` serves the production app at http://127.0.0.1:3001.

## Connect live Twitch chat
1. Register a **Confidential** application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps). Enable 2FA on your Twitch account if prompted.
2. Register `http://localhost:3000/auth/callback` as the OAuth redirect URL.
3. Copy `.env.example` to `.env` and fill in `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. Do not commit `.env`.
4. Run `npm run dev`, then open **http://localhost:3000** and click **Connect Twitch**.
5. Authorize `user:read:chat`, `moderator:manage:banned_users`, and `channel:read:subscriptions`. The server subscribes to chat in the signed-in user's own channel.
6. Send a message in your channel's Twitch chat. It appears in **Live Twitch** view. Replies and structured mentions create directed edges.

The redirect URL in `.env` must exactly match the console. Dev ports are fixed at 3000 (Vite) and 3001 (Express); the Vite proxy handles `/auth`, `/api`, and Socket.IO. Use `localhost` consistently during login. For production-build testing with `npm start`, register and configure `http://localhost:3001/auth/callback` instead.

**View simulation** and **View live chat** switch between separate graphs. The simulator never posts to Twitch. **Disconnect** drops this browser session's server-held tokens, closes EventSub and clears its live graph. To revoke the app's Twitch grant entirely, remove it in Twitch account Connections settings.

OAuth uses a random, expiring, single-use state tied to an HttpOnly, SameSite browser-session cookie. Tokens stay in server memory, refresh before expiry (and on subscription 401), and are validated after sign-in/refresh and every 55 minutes. Reconnect handles keepalives, Twitch-directed session transfers, and fresh subscriptions after dropped sockets. Twitch does not replay messages missed during connection gaps.

Live end-to-end verification requires the account owner to authorize Twitch and send a chat message. The automated suite uses mocked Twitch responses; it cannot establish that real credentials or channel chat work.

## Current milestone
- React/TypeScript responsive dark dashboard, directed SVG graph, nodes sized by message count and coloured by rolling word-filter score.
- Express/Socket.IO server, 2-minute window, message deduplication and shared ingest boundary.
- Heuristic normalisation and word list, whole-message masking, server-side original reveal.
- Target-based detector: at least 5 distinct senders in 30 seconds, flagged messages, and at least 50% of cross-sender pairs with token Jaccard similarity above 0.7.
- Live and simulated data have separate graphs per browser session. Ban and Unban call the Twitch moderation API for selected real users in the signed-in broadcaster's own channel.

## Limits and next steps
This is a local prototype with OAuth and EventSub chat support. No OpenAI scoring, account-age lookup, Louvain, or delete/warn actions yet. Scores are heuristic signals and do not establish abuse or intent. Current graph uses a deterministic radial layout. Tokens, browser sessions, graphs and reveal counts reset on server restart; reconnect Twitch afterward. Local sessions expire after 8 hours. The server binds to loopback and rejects external Host/Origin headers; do not expose it publicly. Session cookies isolate browser data, but this is not a hardened hosted service.

Next: additional detection refinements and message deletion/warnings. Before deployment, add persistent encrypted token storage, production session handling, HTTPS and retention controls. Keep keys server-only. `.env.example` contains placeholders only.

## Layout
`server/` OAuth, Twitch adapter, transport and simulator; `shared/` event types, scoring and detector; `src/` dashboard. `AGENTS.md` contains development constraints. `SUBMISSION.md` tracks Codex work.

For the end-to-end smoke check, keep `npm run dev` running and execute `node scripts/smoke.mjs` in another terminal. This resets the demo and runs a short simulated raid.

## Ban and unban
Refresh ModMap and reconnect Twitch to grant `moderator:manage:banned_users`. In **Live Twitch** view, select another real chatter and click **Ban user**. Clicking Ban applies an indefinite ban immediately. **Unban user** removes a ban or timeout. Success is shown only after Twitch confirms the response. Errors and rate limits are shown without automatic action retries (except one token refresh after HTTP 401).

Simulated identities are blocked from real Twitch moderation endpoints. In simulation view they use a separate local moderation engine; the demo broadcaster is protected. Requests are limited to users seen in this browser session's live graph or its moderation history. A user's latest successful ModMap action remains available under **Recent Twitch actions** or **Recent simulated actions**, so you can select and unban them after their graph node expires. These records are session-local and may differ from changes made directly on Twitch. Rolling toxicity alone does not trigger automatic bans; the separate Autoban words feature must be explicitly enabled.

To test: have an alt account send a mild message in your channel, select its node, ban it, then unban it. The owner-account chat-test script below cannot be used to test banning yourself.

## Send labelled filter-test messages to your own channel
Preview without network requests:

```sh
npm run chat:test -- --channel YOUR_TWITCH_USERNAME --dry-run
```

To actually send six messages, including five mild filter samples:

```sh
npm run chat:test -- --channel YOUR_TWITCH_USERNAME --send
```

The script reads your existing Client ID from `.env`, prints Twitch's device-authorization link/code, and requests `user:write:chat`. Authorize as the owner of the specified channel. No additional redirect URL is needed. Access tokens stay in process memory and are never printed or saved. Messages are clearly labelled MODMAP TEST and spaced three seconds apart. The script stops if Twitch holds/rejects a message or returns an error; it does not bypass moderation or retry message posts. Ctrl+C stops it.

It refuses a mismatched channel owner and active Shared Chat sessions. Keep ModMap connected in Live Twitch view to see the real EventSub pipeline score and mask the messages. One account cannot trigger a multi-account brigade alert; use **Run raid simulation** for that.

## Draw to select multiple users
Click **Draw selection** above the conversation map, press and drag a loop around the users you want, then release. Nodes whose centres fall inside the loop are highlighted. The graph layout stays fixed while drawing, including when new messages arrive. Escape cancels a drawing. In Inspect mode, Shift-click a node (or focus it and press Shift-Enter) to add or remove it from the selection.

Review selected users in the side panel and uncheck anyone to remove them. **Ban selected**, **Timeout selected** and **Unban selected** execute immediately on click for the reviewed selection. The broadcaster is excluded. In live view, simulated identities are excluded; in simulation view, the same controls act locally and return clearly labelled simulated results.

Bulk actions support up to 50 eligible users. The browser sends one request at a time through the existing checked server action, with 500 ms between requests. Each result is shown separately. The queue stops after a failed/uncertain request; remaining users are marked not attempted. **Stop remaining actions** prevents subsequent requests; it cannot undo a request already sent to Twitch. A disconnect also stops the queue. Check Twitch before retrying an uncertain result.

## High-score shortcut and temporary bans
**Select toxic users** selects the visible users whose rolling score is strictly above 0.6, including simulated users for selection practice. **Ban all toxic users** selects eligible high-score accounts in the current two-minute graph for the active view and immediately starts permanently banning them on click. It excludes the broadcaster, and excludes simulated accounts when viewing real Twitch chat. The matching set is captured when clicked; newly arriving users are not added to an in-progress queue. For more than 50 eligible users, review and process smaller selections.

For a temporary ban in either view, choose a **Temporary ban duration** (1 minute, 5 minutes, 10 minutes, 1 hour, 1 day, or 2 weeks) and click **Timeout user** or **Timeout selected**. Twitch ends real restrictions after that duration; the simulation server expires local restrictions on its next state update. The server accepts only integer durations from 1 through 1,209,600 seconds and sends a duration only for timeouts. **Ban** remains indefinite. **Unban** also ends a timeout early.

The toxicity shortcut uses the word-filter heuristic, not an abuse verdict. Review context before clicking a moderation action. Manual bulk operations run immediately when clicked. Autoban word rules separately handle new incoming matches when explicitly enabled.

## Complete simulated moderation demo
No Twitch login or API keys are required. Click **Run raid simulation**, then draw around some attackers or click **Ban all toxic users**. The server immediately removes those users' messages and outgoing edges, recalculates scores/alerts, and suppresses their later scripted messages. Muted nodes remain visible in gray with BANNED or TIMEOUT labels so you can select them and click **Unban user**. Unban and timeout expiry add a harmless local “Chat access restored” message; future scripted messages are accepted again. Reset clears all simulated restrictions and history.

Every local result says **SIMULATED — no Twitch request**. Live and simulated restrictions/history are separate. Moderation requests carry the view they were reviewed in; the server rejects requests if the view has changed. Simulated IDs cannot reach the Twitch client.

The scenario has 14 attackers across two groups, five community participants, and multiple overlapping targets. Some attackers address both a target and another attacker, while community members send supportive replies. Edges retain direction and their flagged/low-signal colouring. Select a node to inspect **Mentions / replies to** and **Mentions / replies from**; hover an arrow for the pair and interaction count. The feed exposes targets even while the flagged message text stays masked.

Run `node scripts/simulation-smoke.mjs` with the dev server running to verify multi-target interactions, local ban/unban, timeout expiry, source/mode isolation and reset. No real Twitch mutations are used by that check.

## Zoom and move the map
Use the mouse wheel/trackpad over the map to zoom around the pointer, or click **+** / **−**. The zoom range is 40%–400%. In **Inspect / move** mode, drag the background or drag from a node to pan; a normal click still inspects a node. **Reset view** returns to the original framing. **Draw selection** uses dragging for the lasso instead of panning, and lasso coordinates follow the current zoom/pan correctly.

Keyboard: focus the map and use arrow keys to pan, **+ / −** to zoom and **0** to reset. Escape cancels a drawing/drag. Zoom is paused during an active drag or lasso so a selection cannot shift under the pointer.

## Toxic word trends and selecting authors
The **Toxic word trends** panel ranks configured word-list matches over the full rolling two-minute window, including messages beyond the feed's latest 100 entries. It shows total occurrences, distinct message counts, and each author's usage count. Repeated terms in one message count as multiple uses but one message. Normalized variants such as `tr4sh` and `trash` share the same canonical term; matching follows the same normalization and word list as message scoring.

Terms are masked by default; **Show words** reveals the canonical dictionary labels, while original flagged messages remain separately censored. Click a word or its **Select N users** button to highlight all current authors on the graph and populate the bulk review panel. Clicking an author chip inspects just that person. Word-based selection includes authors whose rolling score has since fallen below 0.6; existing broadcaster/identity/permission checks still determine which selected users can be moderated.

Selection captures the authors present when clicked; it never adds newly arriving users to a running moderation action. Counts follow the current view and expire/reset with its graph. Simulated bans/timeouts remove a user's source messages and their contributions to these stats. These are heuristic word-list statistics, not model-derived judgments or lifetime user records.

Moderation buttons execute directly without browser popups or in-app confirmation dialogs. Review the selected users and timeout duration before clicking. Bulk queues still show per-user results and provide Stop remaining actions.

## Subscription support and deselecting supporters
Selected-user profiles and the bulk review list show channel support. Reconnect Twitch using **Enable support info** to grant `channel:read:subscriptions`. On chat connection, ModMap subscribes to `channel.subscription.gift` and retrieves the broadcaster's active subscribers with pagination. Only support records for users in the graph or moderation history are sent to this browser.

The labels distinguish:
- **Total gifts reported**: the cumulative gift count from the most recent observed gift event, only if Twitch/the gifter shares it. No general lifetime gift-history lookup is available. Anonymous gifts are not attributed; hidden totals stay unknown.
- **Active gift subs**: currently active subscriptions attributed to this gifter in the most recent complete lookup. This is not their lifetime number of gifts. Lookup time is shown; click **Refresh** to update it.
- **Gifts observed this session**: identified gift quantities received while this server session is tracking events, with delivery-ID deduplication. Connection gaps can miss gifts.
- **Current sub / tier / gift received**: the user's own subscription status at the last lookup. Receiving a gift does not mean the user gave one.

In a multi-user selection, **Unselect gift-givers** removes users with known positive active, observed, or reported gift counts. **Unselect current subs** separately removes known current subscribers, including gift recipients. Both only change the current selection; apply **Ban selected** or **Timeout selected** afterward to act on the remaining users. Unknown support remains selected in manual review. The optional autoban settings can separately exclude known gift-givers or current subscribers.

Failed/incomplete lookups show unavailable data instead of inventing zeros. The app collects at most 100 pages (10,000 active subscriptions) per refresh; a larger or incomplete scan is marked unavailable rather than treated as complete. Chat and moderation continue when support endpoints/events are unavailable. Support state is session-local and clears on Twitch disconnect/reconnect/server restart; it is not a financial ledger.

The simulator includes clearly labelled support fixtures (for example, echo_02 has 50 reported demo gifts and 12 active demo gift subscriptions) so the exclusion controls can be demonstrated without real purchases.

Known subscription gift-givers have a solid gold outline on the network map, keyed in the legend. The same positive active/observed/reported gift evidence powers this outline and Unselect gift-givers. Unknown support and receiving a gift alone do not add the outline. The dashed blue selection ring remains separate, so a selected gift-giver displays both.

## Autoban words
There is one **Autoban words** configuration form, above the bottom word-trends panel. Enter up to 50 single words separated by commas/newlines. Set **Exclude known gift-givers** and/or **Exclude current subscribers**, then click **Enable autoban**. Leave both unchecked to ban all matching users. Enabling a live rule requires broadcaster moderation permission. No browser confirmation is shown.

Rules match normalized whole words (including leetspeak, repeated letters and spaced short words); substring matches and regex patterns are not used. These explicit word rules are independent of the rolling-toxicity threshold and its fixed demo word list. They act on **new accepted messages only**, never scan existing chat for retroactive bans, and always issue permanent bans. For temporary restrictions, use the manual Timeout controls.

The server serializes autobans with 500 ms between ban requests and deduplicates in-flight users/message deliveries. The broadcaster is protected. Each action reuses the same channel/source/permission checks as manual moderation, and real Twitch reasons identify the autoban rule rather than claiming manual review. **Recent rule activity** reports banned, excluded, held and failed results. Unknown/failed action responses stop the rule rather than automatically retrying mutations (the API client may refresh a token once after an explicit 401).

Exclusions use known positive active, observed or shared cumulative gift counts, and subscriber status at the lookup. Hidden lifetime gifts cannot be checked. When exclusions are selected and the active lookup is missing/stale, the rule holds the action. Active lookup data is refreshed when older than 30 seconds; unavailable support must be refreshed/re-authorized before held users can be evaluated on a later message. Held messages are not automatically replayed after refresh.

**Disable autoban** cancels queued work; a request already sent can still complete. Switching views, resetting the current view, reconnecting/disconnecting Twitch, session expiry or server restart disables the relevant rule. Rules and their latest 50 activity records are in memory. There are separate simulation/live rule states, and simulation actions never call Twitch. A manually unbanned account can trigger the rule again on a new matching message.

To demo: enable the simulated rule for `trash`, tick both exclusions, and run the raid. echo_02/echo_05 are gift-giver examples and ember_03 is a subscriber example; they are excluded while other matching accounts are banned locally. Manual moderation buttons remain separate from this single rule form.

Run `node scripts/autoban-smoke.mjs` against the dev server to test simulated autoban, both exemptions, ban-all policy, disabling, view/source checks and reset. It performs no Twitch mutations.

## Browser regression check
With `npm run dev` running, install the test browser once with `npx playwright install chromium`, then run `npm run test:browser`. This uses a fresh browser profile and local simulation only. It checks that the autoban and word-trends panels remain single during incoming chat updates and hot reloads, and rejects React key/root warnings. It touches App/entry modification times to exercise Vite hot reload without changing source contents.

The autoban and word-trends panels use distinct React keys. The app component lives in `src/App.tsx`, the entry point retains one React root, and the socket module disposes outdated clients during development reloads.
