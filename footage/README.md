# ModMap footage pack

1080p, 30 fps, H.264 MP4. Silent editing assets for your own narration. All video exports were rendered locally with HyperFrames. No footage was uploaded.

## Files

- `exports/01-intro.mp4` — 7-second animated opening.
- `exports/02-simulation-walkthrough.mp4` — actual ModMap browser recording, with timed captions and a persistent simulation label. Shows network relationships, account selection, supporter exclusions and simulated bulk bans.
- `exports/03-outro.mp4` — 6-second closing card with repository URL.
- `exports/ModMap-footage-preview.mp4` — the three clips joined for convenient review; this is not the complete hackathon submission.
- `assets/walkthrough.mp4` — clean browser footage without HyperFrames captions.
- `assets/network.png` and `assets/after-actions.png` — actual app screenshots.

## Complete your submission video

Use the intro, explain the graph over the walkthrough, then insert genuine real Twitch and Codex screen recordings before the outro. Keep the finished video below 3 minutes.

Suggested narration for the walkthrough:

> Replies and mentions reveal who is targeting whom. Select the accounts that need review. Moderators can exclude known gift-givers or current subscribers, then apply a bulk action and review each result. This demonstration uses simulated accounts; live moderation uses the Twitch API.

Still record yourself:

1. Real Twitch chat and ModMap side by side, showing a real message becoming a node and mention edge.
2. A moderation action against a consenting test account and its real Twitch result.
3. Actual Codex footage showing the implementation, tests and your real session ID. Never substitute generated terminal animations for this evidence.

## Edit / reproduce

From the repository root:

```sh
npm install --prefix footage
npm --prefix footage run hf -- preview --port=3017 --no-open
```

The HyperFrames entry point is `index.html`; title cards are in `compositions/`. Fonts and GSAP are local assets.

With ModMap already running, regenerate the genuine simulation capture:

```sh
npm --prefix footage run capture
npm --prefix footage run build
npm --prefix footage run hf -- check --json
npm --prefix footage run hf -- render -c compositions/intro.html -o exports/01-intro.mp4 --quality=delivery
npm --prefix footage run hf -- render -o exports/02-simulation-walkthrough.mp4 --quality=delivery
npm --prefix footage run hf -- render -c compositions/outro.html -o exports/03-outro.mp4 --quality=delivery
```

Playwright requires a local Chromium installation (`npx playwright install chromium`); if using a custom browser cache, set `PLAYWRIGHT_BROWSERS_PATH`. The isolated footage tooling installs its own Node 22 runtime; ModMap itself retains its existing runtime and dependencies.

Font licenses: Space Grotesk and DM Sans use SIL Open Font License. GSAP and HyperFrames retain their respective package licenses. No third-party music is used.
