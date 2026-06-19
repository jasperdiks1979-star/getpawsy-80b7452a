# GetPawsy cinematic render worker image.
# Published to GHCR by .github/workflows/build-render-worker-image.yml
# and consumed by a Render "Deploy an Existing Image" service, so each
# redeploy is a pure pull of the tag/digest below — zero Render pipeline
# minutes are consumed.
#
# Runtime expectations match the existing Render service exactly:
#   - Node 20 (render-worker/package.json engines)
#   - bun (remotion/scripts/render-cinematic-ad.mjs has a `#!/usr/bin/env bun`
#         shebang and the worker spawns it directly)
#   - ffmpeg (the render script shells out to it for the 9:16 slideshow)
#   - Health server on $PORT (defaults to 10000 like Render web services)
#
# No source code change is required to swap from the old Git-based service
# to the Existing Image service — same env vars, same Supabase project,
# same Pinterest pipeline, same render_worker_heartbeats writes.

FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    PORT=10000

# System deps: ffmpeg for rendering, ca-certificates + curl for healthchecks
# and Supabase HTTPS calls, unzip for the bun installer, tini for clean PID 1.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
      curl \
      unzip \
      tini \
 && rm -rf /var/lib/apt/lists/*

# Install bun (used by remotion/scripts/render-cinematic-ad.mjs shebang).
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

# Health probe hits the worker's /health endpoint (start.mjs exposes it
# when PORT is set, which it always is in this image).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

EXPOSE 10000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "render-worker/start.mjs"]