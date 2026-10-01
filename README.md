# T3 HR Solutions

Full-stack **ATS (Applicant Tracking System)** prototype, the baseline for a full HR suite (HRIS).

**Start here → [docs/PLAN.md](docs/PLAN.md)**: features, tech stack, system design, REST API contract, frontend spec, work split and roadmap.

| Area | Owner | Folder |
|---|---|---|
| Backend + deployment | [@Rohx24](https://github.com/Rohx24) | `server/`, `Dockerfile`, `deploy/` |
| Frontend | [@SushrithKbtech](https://github.com/SushrithKbtech) | `client/` |

Stack: React + Vite · Node.js 22+ / Express 5 · SQLite (`node:sqlite`) · Docker on AWS EC2

## Run locally

```bash
cd server && npm install && npm run dev      # API on http://localhost:4000 (demo data auto-seeded)
cd client && npm install && npm run dev      # UI on http://localhost:5173 (proxies /api → :4000)
```

- `npm run seed` (in `server/`) wipes the database and re-seeds the demo data.
- `npm test` (in `server/`) runs the parser/matching/dedupe unit tests.
- Sample resumes to upload during a demo are in [`samples/`](samples/).

## Deploy to EC2

1. **Launch** an Ubuntu 24.04 `t3.small` (or `t2.micro` for free tier). Security group: inbound **22** from your IP, **80** from anywhere.
2. **SSH in** and create a read-only deploy key for this private repo:
   ```bash
   ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 && cat ~/.ssh/id_ed25519.pub
   ```
   Paste it into GitHub → repo **Settings → Deploy keys → Add deploy key** (leave "write access" off).
3. **Install and run** (the same command redeploys later):
   ```bash
   ssh-keyscan github.com >> ~/.ssh/known_hosts
   git clone git@github.com:Rohx24/T3-HR-Solutions.git && bash T3-HR-Solutions/deploy/ec2-setup.sh
   ```
   The script installs Docker, builds the image (client + server), runs it on port 80 with a persistent `hr-data` volume, and prints the public URL.
