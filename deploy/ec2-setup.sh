#!/usr/bin/env bash
# One-shot install + (re)deploy on an EC2 instance (Ubuntu 22.04/24.04 or Amazon Linux 2023).
# Safe to re-run: pulls latest code, rebuilds the image, restarts the container. Data persists in the hr-data volume.
#
#   Private repo: clone with a read-only deploy key (see README "Deploy to EC2"), then:
#   REPO_URL=git@github.com:Rohx24/T3-HR-Solutions.git bash deploy/ec2-setup.sh
set -euo pipefail

REPO_URL="${REPO_URL:-git@github.com:Rohx24/T3-HR-Solutions.git}"
APP_DIR="${APP_DIR:-$HOME/T3-HR-Solutions}"
IMAGE=hr-int
CONTAINER=hr-int

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker + git"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y && sudo apt-get install -y docker.io git
  else
    sudo dnf install -y docker git
  fi
  sudo systemctl enable --now docker
fi

if [ -d "$APP_DIR/.git" ]; then
  echo "==> Pulling latest code"
  git -C "$APP_DIR" pull --ff-only
else
  echo "==> Cloning $REPO_URL"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
echo "==> Building image"
sudo docker build -t "$IMAGE" .

echo "==> Restarting container"
sudo docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
sudo docker run -d --name "$CONTAINER" --restart unless-stopped -p 80:4000 -v hr-data:/app/server/data "$IMAGE"

for _ in $(seq 1 20); do
  if curl -fsS http://localhost/api/health >/dev/null 2>&1; then
    echo "==> Live at http://$(curl -fsS http://checkip.amazonaws.com 2>/dev/null || echo '<public-ip>')/"
    exit 0
  fi
  sleep 1
done
echo "!! Health check failed. Logs:" && sudo docker logs --tail 50 "$CONTAINER" && exit 1
