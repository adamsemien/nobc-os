#!/usr/bin/env bash
set -euo pipefail

# 1. Bring the gitignored env into this fresh workspace
if [ -f "${CONDUCTOR_ROOT_PATH:-}/.env.local" ]; then
  cp "${CONDUCTOR_ROOT_PATH}/.env.local" .env.local
elif [ -f "/Users/adamsemien/code/nobc-os-crm/.env.local" ]; then
  cp "/Users/adamsemien/code/nobc-os-crm/.env.local" .env.local
fi

# 2. Install dependencies (swap npm -> pnpm if that's your package manager)
npm install

# 3. Generate the Prisma client (house rule: node binary, never npx)
node node_modules/prisma/build/index.js generate
