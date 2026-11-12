#!/bin/sh
# Installs (or updates) the Git Graph mod into Herdr: copies mods/git-graph into the Herdr home.
# Herdr reloads it at once. A symlink won't do: Herdr doesn't watch through it.
set -e
HOME_DIR="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
SRC="$(cd "$(dirname "$0")" && pwd)/mods/git-graph"
DEST="$HOME_DIR/mods/git-graph"
[ -L "$DEST" ] && rm "$DEST"
mkdir -p "$DEST"
rsync -a --delete --exclude gpui-kit.d.ts --exclude jsconfig.json "$SRC/" "$DEST/"
echo "Installed to $DEST"
command -v herdr-app >/dev/null && herdr-app check "$DEST" || true
