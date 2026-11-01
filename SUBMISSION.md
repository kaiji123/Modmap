# ModMap submission notes

## Codex session
Session ID: TODO — copy the current thread ID from the Codex app/CLI. Do not invent an ID.

## Build log — November 1, 2026
- Asked Codex to implement the first runnable milestone from the hackathon plan.
- Codex created the strict TypeScript React/Vite and Express/Socket.IO repository, shared ingest and scoring engine, labelled simulator, target-based alert, graph, censored history, reveal counter, and domain tests.
- Scope: local simulation; live Twitch integration and OpenAI scoring are not yet implemented.
- Validation: 7 domain tests pass; TypeScript check and Vite production build pass. Local HTTP/Socket.IO smoke check covers simulation, alert latency, masking, reveal and reset. Browser visual QA unavailable in this environment.
- Manual changes: none recorded yet.

## Remaining submission work
- Connect Twitch and record a real alt-account timeout.
- Record Codex development footage and a demo under 3 minutes.
- Add screenshot, actual session ID, repository URL and public YouTube URL.
- Finish Devpost description, testing instructions and submission before the deadline.

## Twitch connection milestone
- After the owner added app credentials locally, Codex added server-side Authorization Code OAuth, session-bound CSRF state, in-memory tokens and refresh/validation.
- Implemented EventSub chat subscription, reply/mention mapping, keepalive monitoring, reconnect transfers and retry after dropped sockets.
- Added browser session isolation, live/simulated view controls and accurate connection labels. Real moderation actions remain disabled.
- Mock adapter/security tests cover OAuth URLs, invalid state, event mapping, subscription, notification, reconnect, token refresh and invalid token identity.
- Owner action still required: authorize the app in Twitch and type in the channel to verify live chat. Do not describe live Twitch as verified until this is done.
- Validation: all 13 tests and the production build pass. Local HTTP/Socket.IO checks pass for OAuth redirect construction, invalid/reused state, external Origin/Host rejection, session isolation, simulated alert latency, masking/reveal and reset. No real Twitch sign-in was performed by Codex.

## Chat testing and moderation milestone
- Owner reported that real Twitch chat ingestion works.
- Added a dry-run-first CLI script that can send six labelled mild filter-test samples to the authenticated owner's own channel using Twitch device authorization and `user:write:chat`. No real messages were sent by Codex.
- Added Ban/Unban buttons, explicit ban confirmation, permission reauthorization, channel-bound Helix calls and recent-action access for users who leave the graph window.
- Rejects simulated/self/unknown targets server-side; reports Twitch errors and prevents concurrent duplicate actions for the same user.
- Verification: 20 unit/mock tests and production build pass. Local smoke checks cover session isolation and rejection of simulated moderation. Real ban/unban still needs an alt-account test by the owner.

## Lasso selection milestone
- Added freehand pointer lasso selection with SVG coordinate conversion, frozen layout while drawing, selected-node rings and a removable user review list.
- Added Shift-click/Shift-Enter selection and Escape cancellation.
- Added reviewed bulk Ban/Unban for eligible real accounts through the existing server checks, sequential pacing, a 50-user cap, per-user results and cancellation. Simulation remains selection-only.
- Validation: geometry and queue tests added; 25 tests pass. Browser pointer interaction and live bulk moderation require manual verification in the app.

## High-score bulk action and timeouts
- Added Select toxic users and reviewed Ban all toxic users actions using rolling score > 0.6, excluding broadcaster/simulated accounts from real actions.
- Added individual and bulk timeouts with selectable duration, server validation and early removal through Unban.
- Added tests for high-score eligibility, exact threshold, timeout boundaries, API duration payload and early timeout removal.
- Final checks: 27 tests, production build, and local simulation smoke check pass. Browser lasso gestures and real bulk moderation/timeouts remain for manual verification; no live Twitch mutations were executed during tests.

## Complete simulation and richer network milestone
- Enabled simulated Ban/Timeout/Unban and bulk actions through a local server-only simulation engine with no Twitch client dependency. Restrictions suppress subsequent scripted messages; removing source messages updates outgoing edges and alerts. Unban and timeout expiry restore local chat access.
- Added view-bound moderation requests, separate simulated action history, muted-node badges and explicit no-Twitch-request result labels.
- Expanded the raid to 42 messages across 14 attackers and five community participants: overlapping target groups, multi-mentions, attacker-to-attacker interactions and friendly support.
- Added visible message targets, selected-user incoming/outgoing interaction lists and arrow tooltips so judges can inspect who is addressing whom.
- Verification: 31 tests and production build pass; local simulation smoke check passes for multi-target graph, ban/unban, timeout expiry, identity/mode rejection and reset. Browser visual QA still requires manual checking.

## Map navigation milestone
- Added cursor-anchored wheel zoom, +/− controls, zoom percentage, drag panning, reset view and keyboard navigation.
- Kept node click inspection separate from drag movement and drawing mode; SVG coordinate conversion keeps lasso selection aligned after camera changes.
- Validation: 33 tests pass, including zoom anchoring/limits and lasso selection after zoom/pan. Browser gesture QA remains manual.

## Toxic word statistics milestone
- Added canonical toxic-word aggregation over the complete rolling window, with occurrence/message counts and distinct author records.
- Added ranked Toxic word trends panel with masked-by-default labels, per-author counts, author inspection, and automatic multi-selection when a word is clicked.
- Word selection feeds the existing review/moderation controls without automatically taking actions. Simulated and live statistics remain view-separated.
- Verification: 36 tests and the production build pass, including disguised spellings, repeated occurrences, duplicate ingest, full-window coverage, removal and expiry. Extended local smoke check validates streamed counts and author identities.

## Direct moderation controls
- Removed browser confirmation prompts at the owner’s request. Single-user and bulk actions now execute directly on click, retaining server checks, per-user results, cancellation and simulated/live separation.

## Support context and selection exclusions
- Added broadcaster-authorized active subscription lookup with pagination and live gift-event tracking. The UI distinguishes active gift counts, current subscription status, observed gifts and reported cumulative totals; unknown/anonymous data is not treated as zero.
- Added support details in individual and bulk review panels, manual refresh, and explicit Unselect gift-givers / Unselect current subs controls. Exclusions only change selection.
- Added isolated, labelled support fixtures to the simulator. Live support needs reauthorization for channel:read:subscriptions and has not been verified with a real subscription/gift.
- Validation: 42 tests pass, including pagination, gift deduplication, anonymous/hidden totals, source isolation, unavailable lookup behavior and supporter selection exclusions. Production build passes.

## Autoban rule milestone
- Added one opt-in word-rule form with independent known gift-giver and current-subscriber exclusions, separate from manual moderation controls.
- Added server-side normalized whole-word matching on new accepted messages, per-user/message deduplication, serial bans, protected broadcaster/source checks and a bounded activity log.
- Missing or stale active-support lookups hold excluded-policy decisions; errors stop the rule. View/reset/auth/session changes disable queued automation. Simulated and live rules remain separate.
- Verification: 50 tests and production build pass; simulated autoban smoke check passes for supporter exclusions, ban-all, disable, view/permission isolation and reset. No live autobans were performed in verification.

## Duplicate-form correction
- Reproduced five autoban forms in an isolated Chromium browser despite one JSX call site. The autoban and word-trends sibling panels shared the same mode key, causing invalid reconciliation during live state updates.
- Gave each panel a distinct React key. Separated App/socket/bootstrap modules and retained the React root during hot updates.
- Browser check verified one autoban form and one word-trends panel through 35 samples of live updates and App/entry hot reloads, with no page errors or duplicate-key/root warnings. Added the check as npm run test:browser.
