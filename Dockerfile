# Cleartake on a Linux server: Next.js, ffmpeg (motion, frames, audio) and Remotion's headless browser (exports).
FROM node:22-bookworm-slim

# ffmpeg; fonts for the video text (Inter, emoji); the libraries Remotion's headless Chrome needs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates fonts-inter fonts-noto-color-emoji \
    libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev libxfixes3 \
    libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx next build
# Download the render browser now, so the first export doesn't.
RUN node --input-type=module -e "import { ensureBrowser } from '@remotion/renderer'; await ensureBrowser();"

ENV NODE_ENV=production
# Projects (videos, voices, exports) live in /app/data: mount a volume there.
CMD ["sh", "-c", "npx next start -H 0.0.0.0 -p ${PORT:-3000}"]
