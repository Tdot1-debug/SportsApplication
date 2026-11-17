# Smarvii Sports worker: FFmpeg/FFprobe + Python. Runs as an unprivileged user.
FROM python:3.12-slim-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 worker
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir . && mkdir -p /tmp/smarvii-worker && chown worker /tmp/smarvii-worker

USER worker
ENV PYTHONUNBUFFERED=1 WORKER_TMP_DIR=/tmp/smarvii-worker
EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["smarvii-worker"]
