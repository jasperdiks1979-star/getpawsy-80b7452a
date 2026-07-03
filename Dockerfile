# Render compatibility Dockerfile.
#
# Some existing Render services in this workspace are still configured to build
# the repository-root `Dockerfile`. The canonical worker image remains defined
# by `render-worker/Dockerfile`; this root file intentionally builds the same
# cinematic render worker so those legacy services stop failing with:
#   open Dockerfile: no such file or directory
#
# Keep behavior aligned with render-worker/Dockerfile: Node 20, bun, ffmpeg,
# Remotion runtime libraries, health server on $PORT, and start.mjs entrypoint.

FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PORT=10000

# System deps: ffmpeg for rendering, ca-certificates + curl for healthchecks
# and backend HTTPS calls, unzip for the bun installer, tini for clean PID 1.
# Plus the shared libraries Chrome-for-Testing needs at runtime.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      curl \
      unzip \
      tini \
      libnss3 \
      libnspr4 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libgbm1 \
      libpango-1.0-0 \
      libcairo2 \
      libasound2 \
      libxshmfence1 \
      libx11-xcb1 \
      libxext6 \
      libxss1 \
      fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

# Install bun (used by remotion scripts and lockfile-aware dependency install).
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash \
 && ln -sf /usr/local/bin/bun /usr/local/bin/bunx \
 && bun --version

WORKDIR /app

# Install render-worker deps first (small, cache-friendly layer).
COPY render-worker/package.json render-worker/package-lock.json* ./render-worker/
RUN cd render-worker \
 && (npm ci --omit=dev 2>/dev/null || npm install --omit=dev) \
 && npm cache clean --force

# Install remotion deps (the render script imports from remotion/).
COPY remotion/package.json remotion/bun.lockb* ./remotion/
RUN cd remotion \
 && bun install --production --no-save \
 && rm -rf /root/.bun/install/cache

# Copy the actual source last so code edits don't bust dep caches.
COPY render-worker ./render-worker
COPY remotion ./remotion

# Health probe hits the worker's /health endpoint when deployed as a Web Service.
# Background Worker deployments can ignore this without changing the entrypoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

EXPOSE 10000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "render-worker/start.mjs"]