#!/usr/bin/env bash
# Hook: Stop
# Fires when Claude finishes responding and is waiting for user input

# Read and discard stdin (hook input JSON)
cat > /dev/null

# Beep the terminal by writing bell character directly to the terminal device
# This bypasses stdout which Claude Code captures for hook response JSON
if [ -w /dev/tty ]; then
  # Linux, macOS, WSL, Git Bash
  printf '\a' > /dev/tty
elif command -v powershell.exe &> /dev/null; then
  # Windows PowerShell fallback
  powershell.exe -Command "[Console]::Beep(800, 200)" 2>/dev/null
fi

exit 0
