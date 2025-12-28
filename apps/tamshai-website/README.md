# Tamshai Corp Website

Static corporate website for Tamshai AI Corp.

## Overview

This is the public-facing corporate website that provides:
- Company information and mission statement
- Leadership team information
- Blog (placeholder)
- Client and Employee login portals (redirects to Keycloak)

## Directory Structure

```
apps/tamshai-website/
├── src/
│   ├── index.html          # Homepage
│   ├── style.css           # Main stylesheet
│   ├── blog.html           # Blog page (placeholder)
│   ├── client-login.html   # Client portal redirect
│   ├── employee-login.html # Employee portal redirect
│   ├── leadership.html     # Leadership team page
│   ├── mission.html        # Mission statement page
│   ├── tamshai-favicon.png # Favicon
│   └── assets/
│       ├── bg-pattern.png
│       ├── emblem.png
│       ├── icon-contact.png
│       ├── icon-mission.png
│       └── icon-solutions.png
├── Dockerfile              # Nginx-based container
└── README.md               # This file
```

## Local Development

### Option 1: Direct File Serving

Open `src/index.html` directly in a browser for quick previews.

### Option 2: Python HTTP Server

```bash
cd apps/tamshai-website/src
python -m http.server 8080
# Open http://localhost:8080
```

### Option 3: Docker

```bash
# Build the container
docker build -t tamshai-website ./apps/tamshai-website

# Run locally
docker run -p 8080:80 tamshai-website
# Open http://localhost:8080
```

### Option 4: Docker Compose (Full Stack)

```bash
cd infrastructure/docker
docker compose up -d tamshai-website
# Website available at http://localhost:8080
```

## Production Deployment

The website is automatically deployed with the VPS infrastructure:

1. Terraform provisions the VPS
2. Cloud-init configures Docker and services
3. Caddy reverse proxy serves the website at the root domain
4. HTTPS is automatically configured via Let's Encrypt

### URL Routing (Production)

| Path | Service |
|------|---------|
| `/` | Tamshai Website (this) |
| `/auth/*` | Keycloak |
| `/api/*` | MCP Gateway (via Kong) |
| `/app/*` | Web Portal (future) |

## Login Redirects

The login pages redirect to the Keycloak authentication system:

- **Client Login**: Redirects to client-specific Keycloak realm
- **Employee Login**: Redirects to `tamshai` realm for enterprise AI access

## Customization

### Updating Content

Edit the HTML files in `src/` directly. No build step required.

### Updating Styles

Modify `src/style.css`. The site uses:
- Google Fonts: Cinzel (headings), Lato (body)
- CSS Grid for layouts
- Custom CSS properties for theming

### Adding New Pages

1. Create new `.html` file in `src/`
2. Copy the header/footer structure from `index.html`
3. Update navigation links in all pages if needed
4. Rebuild Docker image for deployment

## Asset Optimization

The current assets are unoptimized (~33MB total). For production:

```bash
# Install optipng (or use online tools)
optipng -o7 src/assets/*.png

# Or convert to WebP for better compression
cwebp -q 80 src/assets/emblem.png -o src/assets/emblem.webp
```

## Related Documentation

- [Main Project README](../../README.md)
- [VPS Deployment Guide](../../infrastructure/terraform/vps/README.md)
- [Architecture Overview](../../docs/architecture/overview.md)
