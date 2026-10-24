#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
if [ "$#" -eq 0 ]; then echo 'Укажите сообщение коммита: sh scripts/publish.sh "feat: описание"'; exit 1; fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo 'Сначала восстановите Git-историю из history/racionika.bundle (см. README).'; exit 1
fi
git add --all
git diff --cached --quiet || git commit -m "$*"
git push -u origin main
