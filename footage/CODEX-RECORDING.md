# Genuine Codex recording

The recorder captures only the largest visible VS Code or Codex window, including its real conversation and terminal. It records no microphone audio. It never constructs a fake Codex interface.

macOS screen-recording permission is required. Enable the host app under System Settings → Privacy & Security → Screen & System Audio Recording. macOS may require reopening that app before capture works.

Keep the real Codex conversation visible. Close unrelated tabs, especially `.env`, before recording.

From the project root:

```sh
npm --prefix footage run record:codex -- 45
```

The script compiles the local Swift recorder, captures 45 seconds and exports a 1920×1080, 30fps MP4 into `footage/exports/04-codex-real-<timestamp>.mp4`. Original window capture stays in `footage/assets/codex/`. Neither is tracked by Git.

For useful hackathon evidence, show a genuine Codex prompt, its actual edit/diff, then the real test result. Trim this down to roughly 20–30 seconds in the final video. Record the actual session ID from your Codex session separately; this script does not invent or substitute an ID.
