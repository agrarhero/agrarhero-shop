#!/usr/bin/env bash
set -e
echo "### Agrarhero Setup ###"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git nginx ca-certificates
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v
mkdir -p /opt
if [ -d /opt/agrarhero/.git ]; then
  git -C /opt/agrarhero fetch --all
  git -C /opt/agrarhero reset --hard origin/main
else
  git clone https://github.com/agrarhero/agrarhero-shop.git /opt/agrarhero
fi
cd /opt/agrarhero
mkdir -p data public/img/products
if [ ! -f .env ]; then
  ADMINPW="$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)"
  cat > .env <<EOF
BASE_URL=https://agrarhero.de
SELLER_BRAND=Agrarhero
SELLER_NAME=WS - AGRARHANDEL GmbH
SELLER_LEGALFORM=GmbH
SELLER_ADDRESS=Erlenweg 13, 82110 Germering
SELLER_COUNTRY=Deutschland
SELLER_MANAGER=Wilhelm Schaich, Enrico Heyne
SELLER_MANAGER_ROLE=Geschäftsführer
SELLER_REGISTER_COURT=Amtsgericht München
SELLER_REGISTER_NO=HRB 268415
SELLER_EMAIL=info@agrarhero.de
SELLER_PHONE=+49 89 45210988
SELLER_WEB=www.agrarhero.de
SELLER_IBAN=DE00 0000 0000 0000 0000 00
SELLER_BIC=XXXXDEXXXXX
SELLER_BANK=Musterbank
SELLER_USTID=
SELLER_TAXRATE=19
ADMIN_EMAIL=admin@agrarhero.de
ADMIN_PASSWORD=$ADMINPW
PORT=3000
MAIL_BCC=info@agrarhero.de
EOF
  echo "$ADMINPW" > /root/ADMIN-PASSWORT.txt
fi
node --experimental-sqlite seed.js || true
cat > /etc/systemd/system/agrarhero.service <<'EOF'
[Unit]
Description=Agrarhero Shop
After=network.target
[Service]
WorkingDirectory=/opt/agrarhero
EnvironmentFile=/opt/agrarhero/.env
ExecStart=/usr/bin/node --experimental-sqlite server.js
Restart=always
User=root
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable agrarhero
systemctl restart agrarhero
cat > /etc/nginx/sites-available/agrarhero <<'EOF'
server {
    listen 80;
    server_name agrarhero.de www.agrarhero.de;
    client_max_body_size 20M;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
ln -sf /etc/nginx/sites-available/agrarhero /etc/nginx/sites-enabled/agrarhero
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
echo "### FERTIG - Admin-Passwort steht in /root/ADMIN-PASSWORT.txt ###"
