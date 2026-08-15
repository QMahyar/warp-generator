#!/usr/bin/env bash
# router-spawn — spawn a headless pi worker in a detached tmux session.
#
# Usage: router-spawn <session-name> <working-dir> <prompt-file>
#
# The prompt file must be a complete, self-contained task:
#   - say what to read and what to write (absolute output path)
#   - require a result file (the message bus) and a final DONE reply
# Write prompt files under .scratch/router/tasks/.

set -euo pipefail

name="$1"
dir="$2"
prompt_file="$3"

if [ ! -f "$prompt_file" ]; then
  echo "prompt file not found: $prompt_file" >&2
  exit 1
fi

# Escape single quotes so arbitrary prompt text survives the command line.
escaped=$(sed "s/'/'\\\\''/g" "$prompt_file")

tmux new-session -d -s "$name" -c "$dir" "pi -p '$escaped'"

echo "spawned session '$name' (cwd: $dir)"
echo "  monitor: tmux capture-pane -t $name -p | tail -20"
echo "  attach:  tmux attach -t $name"
echo "  steer:   tmux send-keys -t $name 'message' Enter"
echo "  reap:    tmux kill-session -t $name"