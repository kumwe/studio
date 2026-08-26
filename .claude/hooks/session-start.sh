#!/bin/bash
# Prepare a Claude Code on the web container for full Studio development:
# the exact Node/npm engine family, the OpenSSH client the evidence
# authentication tests shell out to, and the locked dependency tree. After
# this hook, every quality lane in `npm run check` runs locally.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REQUIRED_NODE_MAJOR=24
current_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$current_major" -lt "$REQUIRED_NODE_MAJOR" ]; then
  for nvm_dir in "${NVM_DIR:-}" /opt/nvm "$HOME/.nvm"; do
    if [ -n "$nvm_dir" ] && [ -s "$nvm_dir/nvm.sh" ]; then
      export NVM_DIR="$nvm_dir"
      # shellcheck disable=SC1091
      . "$nvm_dir/nvm.sh"
      nvm install "$REQUIRED_NODE_MAJOR" >/dev/null 2>&1
      nvm alias default "$REQUIRED_NODE_MAJOR" >/dev/null 2>&1
      node_bin="$(dirname "$(nvm which "$REQUIRED_NODE_MAJOR")")"
      if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
        echo "export PATH=\"$node_bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
      fi
      PATH="$node_bin:$PATH"
      break
    fi
  done
fi
echo "node $(node --version) / npm $(npm --version)"

# scripts/test/evidence-validation.test.mjs signs review fixtures with
# ssh-keygen; without it two tests fail that pass in CI.
if ! command -v ssh-keygen >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    (apt-get update -qq && apt-get install -y -qq openssh-client) \
      || echo "WARNING: could not install openssh-client; evidence signing tests will fail locally." >&2
  else
    echo "WARNING: ssh-keygen unavailable and apt-get missing; evidence signing tests will fail locally." >&2
  fi
fi

cd "$CLAUDE_PROJECT_DIR"
npm install --no-audit --no-fund
