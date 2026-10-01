#!/usr/bin/env bash
# T3Cogno Talent: continuous deployment on the EC2 server.
#
# Deploys the newest commit on GitHub `main` once its CI job ("test") has passed, with a rolling
# update (app2, then app1, then an Nginx reload) so the site never goes down. If a new replica fails
# its health check, the previous image is restored and the commit is not retried.
#
# Runs every 2 minutes from hr-deploy.timer, and from the restricted `deployer` SSH key
# (authorized_keys forces this command; anything typed after `ssh deployer@...` is ignored,
# because this script reads no arguments and no input).
#
# Install (as root):  install -o root -g root -m 755 deploy/hr-deploy.sh /usr/local/bin/hr-deploy
set -euo pipefail
umask 022
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

REPO="Rohx24/T3-HR-Solutions"
BRANCH="main"
CHECK_NAME="test"
APP_DIR="/home/ubuntu/T3-HR-Solutions"
STATE_DIR="/var/lib/hr-deploy"

log() { echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] $*"; }

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/lock"
if ! flock -n 9; then
  log "Another deploy is already running."
  exit 0
fi

sha=$(git ls-remote "https://github.com/$REPO.git" "refs/heads/$BRANCH" | cut -f1)
[ -n "$sha" ] || { log "Could not read $BRANCH from GitHub."; exit 1; }
short=${sha:0:7}

if [ "$sha" = "$(cat "$STATE_DIR/deployed" 2>/dev/null || true)" ]; then
  log "Up to date: $short is live."
  exit 0
fi
if [ "$sha" = "$(cat "$STATE_DIR/failed" 2>/dev/null || true)" ]; then
  log "$short failed earlier (tests or health check). Waiting for a new commit."
  exit 0
fi

# Only ship commits whose GitHub Actions "test" job succeeded.
status=$(curl -fsS -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/commits/$sha/check-runs?check_name=$CHECK_NAME" |
  python3 -c 'import json,sys; r=json.load(sys.stdin).get("check_runs") or []; print("none" if not r else (r[0].get("conclusion") or r[0].get("status")))')
case "$status" in
  success) ;;
  none | queued | in_progress | pending | waiting | requested)
    log "$short: waiting for the tests to finish on GitHub ($status)."
    exit 0 ;;
  *)
    log "$short: tests $status on GitHub, not deploying."
    echo "$sha" > "$STATE_DIR/failed"
    exit 1 ;;
esac

log "Deploying $short"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git clone -q --filter=blob:none "https://github.com/$REPO.git" "$work/src"
git -C "$work/src" checkout -q "$sha"
subject=$(git -C "$work/src" log -1 --format=%s)

log "Building the image (keeping the current one as a fallback)"
docker image inspect hr-int:latest >/dev/null 2>&1 && docker tag hr-int:latest hr-int:previous
docker build -q --build-arg GIT_SHA="$short" -t hr-int:latest "$work/src" >/dev/null

log "Updating compose and Nginx config"
rsync -a --delete --exclude .env --exclude .git --chown=ubuntu:ubuntu "$work/src/" "$APP_DIR/"
cd "$APP_DIR"

healthy() {
  local id
  for _ in $(seq 1 60); do
    id=$(docker compose ps -q "$1")
    [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null)" = healthy ] && return 0
    sleep 2
  done
  return 1
}

rollback() {
  log "$1 did not become healthy. Rolling back to the previous version."
  echo "$sha" > "$STATE_DIR/failed"
  if docker image inspect hr-int:previous >/dev/null 2>&1; then
    docker tag hr-int:previous hr-int:latest
    docker compose up -d --no-build --no-deps app2 app1 >/dev/null 2>&1 || true
    docker compose exec -T lb nginx -s reload >/dev/null 2>&1 || true
  fi
  exit 1
}

for svc in app2 app1; do
  log "Replacing $svc"
  docker compose up -d --no-build --no-deps "$svc" >/dev/null 2>&1
  healthy "$svc" || rollback "$svc"
done
docker compose up -d --no-build >/dev/null 2>&1
docker compose exec -T lb nginx -s reload >/dev/null 2>&1

echo "$sha" > "$STATE_DIR/deployed"
docker image prune -f >/dev/null 2>&1 || true
log "Live: $short $subject"
