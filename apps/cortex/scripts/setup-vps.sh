#!/bin/bash
# DigitalOcean VPS initial setup for Cortex.
# Run as root on a fresh Ubuntu 24.04 droplet.
# Usage: curl -sL <raw-url> | bash

set -euo pipefail

DOMAIN="${1:-cortex.ryvanai.com}"
EMAIL="${2:-naveen@ryvanai.com}"
APP_DIR="/opt/cortex"

echo "=== Cortex VPS Setup ==="
echo "Domain: ${DOMAIN}"
echo "Email:  ${EMAIL}"
echo ""

# System updates
echo "[1/8] Updating system..."
apt-get update -qq && apt-get upgrade -y -qq

# Docker
echo "[2/8] Installing Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Docker Compose (v2 comes with Docker now)
docker compose version

# Firewall
echo "[3/8] Configuring firewall..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# App directory
echo "[4/8] Creating application directory..."
mkdir -p ${APP_DIR}/backups
mkdir -p ${APP_DIR}/nginx
cd ${APP_DIR}

echo "[5/8] Clone your repository..."
echo "  git clone https://github.com/YOUR_ORG/cortex-growth.git ${APP_DIR}/app"
echo "  Then copy .env.production into ${APP_DIR}/app/"
echo ""

# SSL certificate (initial)
echo "[6/8] SSL setup instructions..."
echo "  After DNS propagates (cortex.ryvanai.com -> this VPS IP):"
echo ""
echo "  1. Start nginx without SSL first (comment out ssl lines in cortex.conf)"
echo "  2. Run: docker compose up -d nginx"
echo "  3. Get certificate:"
echo "     docker compose run --rm certbot certonly \\"
echo "       --webroot -w /var/www/certbot \\"
echo "       -d ${DOMAIN} \\"
echo "       --email ${EMAIL} \\"
echo "       --agree-tos --no-eff-email"
echo "  4. Uncomment SSL lines in cortex.conf"
echo "  5. Restart: docker compose up -d"
echo ""

# Backup cron
echo "[7/8] Setting up daily backup cron..."
echo "0 2 * * * cd ${APP_DIR}/app && docker compose exec -T backup /scripts/backup.sh >> ${APP_DIR}/backups/cron.log 2>&1" | crontab -

# Swap (for 4GB VPS)
echo "[8/8] Adding swap..."
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Clone repo:  git clone <your-repo> ${APP_DIR}/app"
echo "  2. Configure:   cp .env.production ${APP_DIR}/app/.env.production"
echo "  3. Edit secrets: nano ${APP_DIR}/app/.env.production"
echo "  4. DNS:          Add A record: cortex -> $(curl -s ifconfig.me)"
echo "  5. Build:        cd ${APP_DIR}/app && docker compose --env-file .env.production build"
echo "  6. Start DB:     docker compose --env-file .env.production up -d postgres"
echo "  7. Migrate:      docker compose --env-file .env.production --profile tools run --rm migrate"
echo "  8. Seed admin:   docker compose --env-file .env.production --profile tools run --rm seed"
echo "  9. Deploy:       docker compose --env-file .env.production up -d"
echo "  10. SSL:         certbot certonly --webroot -w /var/www/certbot -d cortex.ryvanai.com"
echo ""
