#!/bin/sh
# Despliega el frontend React de SGC-Web en Apache (/var/www/sgc-web).
# Ejecutar en el servidor: cd /opt/sgc-web && sh scripts/deploy-frontend-apache.sh

set -e
cd /opt/sgc-web/frontend

echo "=== npm install ==="
npm install

echo "=== npm run build ==="
npm run build

echo "=== rsync dist -> /var/www/sgc-web ==="
rsync -av --delete dist/ /var/www/sgc-web/

echo "=== recargar Apache ==="
apache2ctl configtest
systemctl reload apache2

echo ""
echo "Listo. Abra: https://fcnarqnodo.hopto.org/sgc-web/login/"
echo "Use Ctrl+Shift+R para evitar caché del navegador."
echo ""
echo "Verificar portal de modulos en el build:"
grep -rl "Seleccione el módulo" /var/www/sgc-web/ || echo "FALTA: suba App.tsx y ModulesPortalPage.tsx y vuelva a compilar"
