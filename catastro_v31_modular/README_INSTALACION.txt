# Catastro v31 modular

Estructura:
- index.html carga ahora los archivos en /js en orden.
- catastro.css queda igual.
- catastro_legacy_v31_concat.js es respaldo concatenado del JS original recibido.

Instalación sugerida:

```bash
cd /var/www/catastro
sudo mkdir -p backup_v31_$(date +%Y%m%d_%H%M)
sudo cp -a index.html catastro.css catastro.js js backup_v31_$(date +%Y%m%d_%H%M)/ 2>/dev/null || true
sudo cp -a /ruta/del_zip_extraido/index.html /var/www/catastro/index.html
sudo cp -a /ruta/del_zip_extraido/catastro.css /var/www/catastro/catastro.css
sudo mkdir -p /var/www/catastro/js
sudo cp -a /ruta/del_zip_extraido/js/*.js /var/www/catastro/js/
sudo systemctl restart apache2
```

Después, en navegador: Ctrl + F5.
