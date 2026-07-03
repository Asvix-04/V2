FROM node:20-bookworm-slim AS frontend-build

WORKDIR /build/crypt

COPY crypt/package.json crypt/package-lock.json ./
RUN npm ci

COPY crypt/ ./

# Hugging Face Space variables are passed to Docker as build arguments.
# Firebase's browser configuration is public configuration, not a server secret.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID

ENV VITE_API_URL=/api \
    VITE_CHATBOT_API_URL=/api/voice \
    VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} \
    VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID} \
    VITE_FIREBASE_STORAGE_BUCKET=${VITE_FIREBASE_STORAGE_BUCKET} \
    VITE_FIREBASE_MESSAGING_SENDER_ID=${VITE_FIREBASE_MESSAGING_SENDER_ID} \
    VITE_FIREBASE_APP_ID=${VITE_FIREBASE_APP_ID}

RUN npm run build


FROM node:20-bookworm-slim AS node-dependencies

WORKDIR /build/backend

COPY crypt/backend/package.json crypt/backend/package-lock.json ./
RUN npm ci --omit=dev


FROM node:20-bookworm-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    PORT=7860 \
    PYTHON_PORT=8000 \
    PYTHON_BACKEND_URL=http://127.0.0.1:8000 \
    PATH=/opt/venv/bin:${PATH}

RUN apt-get update -o Acquire::Retries=3 \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        ffmpeg \
        libportaudio2 \
        libsndfile1 \
        python3 \
        python3-pip \
        python3-venv \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node/app

COPY Backend_chatbot/req.txt /tmp/python-requirements.txt
RUN /opt/venv/bin/pip install --no-cache-dir \
        torch --index-url https://download.pytorch.org/whl/cpu \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/python-requirements.txt \
    && rm /tmp/python-requirements.txt

COPY --chown=node:node Backend_chatbot/ ./Backend_chatbot/
COPY --chown=node:node crypt/backend/ ./crypt/backend/
COPY --chown=node:node --from=node-dependencies /build/backend/node_modules ./crypt/backend/node_modules
COPY --chown=node:node --from=frontend-build /build/crypt/dist ./crypt/dist
COPY --chown=node:node start_servers.sh ./start_servers.sh

RUN chmod +x ./start_servers.sh \
    && mkdir -p uploads/audio \
    && chown -R node:node uploads

USER node

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:7860/api/voice/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["./start_servers.sh"]
