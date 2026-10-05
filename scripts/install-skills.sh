#!/usr/bin/env bash
# Installs the design skills this repo's UI work is expected to use.
#
# The Apple HIG text inside dickwu/apple-design-skill is Apple's, reproduced
# by that repo, so it is installed by reference (pinned commit, gitignored)
# instead of being vendored into this repository. See decisions.md D-012.
#
# Usage: scripts/install-skills.sh
set -euo pipefail

SKILL_REPO="https://github.com/dickwu/apple-design-skill"
SKILL_COMMIT="904b0ee"   # pinned; bump deliberately after re-reading SKILL.md
DEST=".claude/skills/apple-design"

cd "$(dirname "$0")/.."

if [ -d "$DEST/.git" ]; then
  echo "apple-design already installed at $DEST ($(git -C "$DEST" rev-parse --short HEAD))"
  exit 0
fi

mkdir -p "$(dirname "$DEST")"
GIT_LFS_SKIP_SMUDGE=1 git clone --quiet "$SKILL_REPO" "$DEST"
git -C "$DEST" checkout --quiet "$SKILL_COMMIT"
echo "Installed apple-design @ $SKILL_COMMIT into $DEST"
echo "Claude Code picks it up as /apple-design in the next session."
