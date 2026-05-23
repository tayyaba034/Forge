#!/usr/bin/env bash
set -euo pipefail
# Deploy the web app on Vercel from the monorepo's packages/web folder.
cd "$(dirname "$0")/.."
cd packages/web
# Ensure you are logged in: `vercel login` or set `VERCEL_TOKEN` in env
vercel --prod
