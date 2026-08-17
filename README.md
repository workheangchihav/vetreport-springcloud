# Lucky System - Microservices Application

## Overview

A Spring Boot microservices application with Next.js frontend and Rust Actix Web service, featuring centralized environment configuration.

## Project Structure

```
demo/
├── .env                    # ⭐ CENTRALIZED CONFIGURATION (single source of truth)
├── .env.example            # Template for .env
│
├── backend/                # Spring Boot microservices + Rust service
│   ├── .env -> ../.env    # Symlink to root .env
│   ├── gateway/
│   ├── auth-server/
│   ├── call-service/
│   ├── delivery-service/
│   ├── marketing-service/
│   └── branchreport-service/  # Rust Actix Web service
│
├── frontend/               # Next.js application
│   └── .env.local -> ../.env  # Symlink to root .env
│
└── devops/
    ├── docker/            # Docker Compose setup
    │   ├── .env -> ../../.env         # Symlink to root .env
    │   ├── .env.example -> ../../.env.example
    │   ├── docker-compose.yml     # Local development
    │   └── docker-compose.prod.yml # Production
    │
    └── cloudflared/       # Cloudflare tunnel config
        ├── config.yml
        ├── vetapi-khmersoftware.json
        └── cert.pem
```

## Quick Start

### 1. Setup Environment

```bash
# Copy example file
cp .env.example .env

# Edit with your values
nano .env
```

### 2. Run with Docker Compose

```bash
cd devops/docker
docker compose up -d
```

## Centralized Configuration

### Single .env File

All configuration is managed through **one `.env` file** at the project root:

```bash
# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_NAME=demo-tunnel
CLOUDFLARE_DOMAIN=vetapi.mooniris.com,https://dev.mooniris.com

# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password

# Gateway & CORS
GATEWAY_CORS_ALLOWED_ORIGIN_PATTERNS=http://localhost:*,https://vetapi.mooniris.com,https://dev.mooniris.com
ALLOWED_ORIGINS=http://localhost:3000,https://vetapi.mooniris.com,https://dev.mooniris.com

# And more...
```

### How It Works

- **Root `.env`**: Single source of truth
- **Symlinks**: All subdirectories link to root `.env`
- **Docker Compose**: Automatically reads `.env` from its directory
- **Frontend**: Next.js reads `.env.local` (symlinked to root `.env`)
- **Backend**: Can read root `.env` for local development

### Benefits

✅ **One file to manage** - No scattered configuration  
✅ **Consistent values** - Same config across all environments  
✅ **Easy updates** - Change domain in one place  
✅ **Version control** - Only `.env.example` is committed  
✅ **Environment-specific** - Easy to create `.env.dev`, `.env.prod`  

## Changing Domain

### Simple Change

```bash
# Edit root .env file
CLOUDFLARE_DOMAIN=new-domain.com

# Restart services
cd devops/docker
docker compose restart cloudflared
```

### Multiple Environments

```bash
# Create environment-specific files
cp .env .env.dev
cp .env .env.staging
cp .env .env.prod

# Edit each with environment-specific values
nano .env.dev     # dev.mooniris.com
nano .env.staging # staging.mooniris.com
nano .env.prod    # vetapi.mooniris.com,https://dev.mooniris.com

# Use specific environment
cp .env.prod .env
docker compose up -d
```

## Development

### Local Development

```bash
# Backend (Spring Boot)
cd backend
./mvnw spring-boot:run

# Frontend (Next.js)
cd frontend
npm install
npm run dev
```

### Docker Development

```bash
cd devops/docker
docker compose up -d
docker compose logs -f
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Next.js application |
| Gateway | 8080 | API Gateway |
| User Service | 8081 | User management |
| Call Service | 8082 | Call management |
| Delivery Service | 8083 | Delivery management |
| Marketing Service | 8084 | Marketing management |
| Branch Report Service | 8085 | Branch reporting (Rust) |
| PostgreSQL | 5433 | Database |
| Redis | 6380 | Cache |
| Grafana | 3300 | Monitoring |
| Prometheus | 9090 | Metrics |

## Cloudflare Tunnel

The application uses Cloudflare Tunnel for secure external access:

- **Domain**: Configured via `CLOUDFLARE_DOMAIN` in `.env`
- **Tunnel**: Named tunnel with credentials
- **Config**: `/devops/cloudflared/config.yml` (uses env variables)
- **Docs**: See `/devops/cloudflared/README.md`

## Documentation

- **Docker Compose**: See `/devops/docker/README.md` (if exists)
- **Cloudflare**: See `/devops/cloudflared/README.md`

## Best Practices

1. ✅ **Never commit `.env`** - Only commit `.env.example`
2. ✅ **Use root `.env`** - Don't create multiple `.env` files
3. ✅ **Update `.env.example`** - When adding new variables
4. ✅ **Validate before deploy** - Check all required variables are set
5. ✅ **Use environment-specific files** - For dev/staging/prod
6. ❌ **Don't hardcode values** - Always use environment variables
7. ❌ **Don't commit secrets** - Use `.env` or secret management

## Troubleshooting

### Environment Variables Not Loading

```bash
# Check if .env exists
ls -la .env

# Check symlinks
ls -la */**.env*

# Verify content
cat .env
```

### Docker Compose Issues

```bash
# Check if .env is loaded
docker compose config

# Restart with fresh .env
docker compose down
docker compose up -d
```

## Support

For issues or questions:
1. Check `.env` file exists and has correct values
2. Verify symlinks are working: `ls -la */**.env*`
3. Check service logs: `docker compose logs <service>`
4. Review documentation in `/devops/*/README.md`
