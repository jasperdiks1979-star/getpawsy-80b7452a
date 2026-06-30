# Docker Deployment Guide

## Overview

Dit project bevat Docker configuratie voor deployment naar verschillende platforms zoals AWS ECS, Google Cloud Run, Azure Container Apps, of eigen servers.

## Quick Start

### Production Build

```bash
# Build de production image
docker build -t getpawsy:latest .

# Run de container
docker run -p 80:80 getpawsy:latest
```

### Development met Hot Reload

```bash
# Start development environment
docker-compose --profile dev up dev

# Of gebruik de dev Dockerfile direct
docker build -f Dockerfile.dev -t getpawsy:dev .
# Productie frontend image (voorheen `Dockerfile`, hernoemd zodat Render
# auto-detect de worker-service niet meer per ongeluk de frontend laat bouwen):
docker build -f Dockerfile.frontend -t getpawsy:prod .
docker run -p 8080:8080 -v $(pwd):/app getpawsy:dev
```

## Deployment Platforms

### AWS ECS/Fargate

1. **Push naar ECR:**
```bash
# Login naar ECR
aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.eu-west-1.amazonaws.com

# Tag en push
docker tag getpawsy:latest <account-id>.dkr.ecr.eu-west-1.amazonaws.com/getpawsy:latest
docker push <account-id>.dkr.ecr.eu-west-1.amazonaws.com/getpawsy:latest
```

2. **ECS Task Definition:**
```json
{
  "containerDefinitions": [
    {
      "name": "getpawsy",
      "image": "<account-id>.dkr.ecr.eu-west-1.amazonaws.com/getpawsy:latest",
      "portMappings": [{ "containerPort": 80, "protocol": "tcp" }],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:80/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

### Google Cloud Run

```bash
# Build en push naar GCR
gcloud builds submit --tag gcr.io/PROJECT_ID/getpawsy

# Deploy naar Cloud Run
gcloud run deploy getpawsy \
  --image gcr.io/PROJECT_ID/getpawsy \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 80
```

### Azure Container Apps

```bash
# Login naar Azure Container Registry
az acr login --name <registry-name>

# Build en push
docker tag getpawsy:latest <registry-name>.azurecr.io/getpawsy:latest
docker push <registry-name>.azurecr.io/getpawsy:latest

# Deploy naar Container Apps
az containerapp create \
  --name getpawsy \
  --resource-group <resource-group> \
  --environment <environment-name> \
  --image <registry-name>.azurecr.io/getpawsy:latest \
  --target-port 80 \
  --ingress external
```

### DigitalOcean App Platform

```yaml
# app.yaml
name: getpawsy
services:
  - name: web
    dockerfile_path: Dockerfile
    http_port: 80
    instance_size_slug: basic-xxs
    instance_count: 1
    routes:
      - path: /
    health_check:
      http_path: /health
```

### Kubernetes (Helm/kubectl)

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: getpawsy
spec:
  replicas: 2
  selector:
    matchLabels:
      app: getpawsy
  template:
    metadata:
      labels:
        app: getpawsy
    spec:
      containers:
        - name: getpawsy
          image: getpawsy:latest
          ports:
            - containerPort: 80
          livenessProbe:
            httpGet:
              path: /health
              port: 80
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            limits:
              cpu: "500m"
              memory: "256Mi"
            requests:
              cpu: "100m"
              memory: "128Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: getpawsy
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 80
  selector:
    app: getpawsy
```

## Environment Variables

Voor productie deployments, configureer de volgende environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key | Yes |

**Let op:** Voor Docker builds moeten deze variabelen beschikbaar zijn tijdens build time voor Vite:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=xxx \
  -t getpawsy:latest .
```

## Health Checks

De container exposeert een health check endpoint op `/health` die:
- `200 OK` returned wanneer de applicatie gezond is
- Gebruikt wordt door orchestrators voor liveness/readiness probes

## Performance Optimizations

De production image is geoptimaliseerd met:
- **Multi-stage builds** - Minimale image size (~25MB)
- **Nginx** - High-performance static file serving
- **Gzip compression** - Automatische compressie
- **Browser caching** - Long-lived cache voor static assets
- **Security headers** - XSS protection, Content-Type options

## Troubleshooting

### Container start niet
```bash
# Check logs
docker logs <container-id>

# Shell access
docker exec -it <container-id> /bin/sh
```

### Build fails
```bash
# Clean build zonder cache
docker build --no-cache -t getpawsy:latest .
```

### Port conflicts
```bash
# Gebruik een andere port
docker run -p 3000:80 getpawsy:latest
```
