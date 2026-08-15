# Router protocol — this session orchestrates pi worker sessions via tmux

The **router** is this pi session. It owns the design tree, the spec, the
tickets, and the review loop. **Workers** are headless pi instances running in
detached tmux sessions, dispatched by the router for slices of work the router
should not hold in its own context window (research, ticket implementation,
code review, prototypes).

## The loop (proven end-to-end 2026-08-15)

1. **Task** — router writes a self-contained prompt file under
   `.scratch/router/tasks/` (absolute output paths; result file required;
   final reply must be `DONE`).
2. **Spawn** — `scripts/router-spawn.sh <session> <dir> <prompt-file>`
   creates a detached tmux session running `pi -p "<task>"`.
3. **Work** — the worker reads files, writes its result, exits. Workers run in
   parallel; each gets its own session and its own output paths. Workers never
   commit, never touch the router's files.
4. **Telemetry** — the router checks result files, tails the worker's session
   log (`~/.pi/agent/sessions/--<cwd-encoded>--/<ts>.jsonl`), and can
   `tmux capture-pane -t <session> -p` for the live screen.
5. **Steer** (interactive workers only, use sparingly) —
   `tmux send-keys -t <session> "message" Enter`. Prefer file-based one-shots.
6. **Reap** — verify the result, then `tmux kill-session -t <session>`.
   Killing the last session stops the tmux server; that is fine.

## Conventions

- Session names: `wg-<slice>`, e.g. `wg-research-endpoints`, `wg-ticket-004`.
- The message bus is **files**: tasks in, results out. Never chat results back.
- Worker cwd = repo root unless the slice needs another dir.
- One-shot `-p` workers for everything possible; keep interactive workers
  (send-keys steering) only for things a one-shot cannot do.

## Notes

- Termux has no `/tmp` — absolute temp paths live under `$HOME`.
- tmux 3.7b here supports `extended-keys`; if a human will attach to a worker,
  add `set -g extended-keys on` + `extended-keys-format csi-u` to
  `~/.tmux.conf` and restart the server.
- The router itself lives outside tmux today. Restart it inside tmux at some
  phase boundary if it must survive Termux app restarts (tmux sessions survive
  app closure; a plain pts does not).