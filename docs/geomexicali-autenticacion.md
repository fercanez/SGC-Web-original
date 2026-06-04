# Autenticación GeoMexicali (capas con permisos)

En [www.geomexicali.info](https://www.geomexicali.info) las capas WMS **no son públicas**: hace falta usuario con permiso de lectura. SGC-Web resuelve esto con un **usuario de servicio** en el servidor, no en el navegador.

## Cómo funciona

```
Navegador  →  /api/v1/geonode/wms  →  API SGC-Web (.env con usuario/clave)
                                              ↓ Basic Auth
                                    GeoServer /geoserver/wms
```

- El operador **no** escribe la clave de GeoNode en el frontend.
- `GEONODE_USER` y `GEONODE_PASSWORD` viven solo en `.env` del backend (o secretos del servidor).

## 1. Crear usuario de servicio en GeoNode

1. Inicie sesión en GeoNode como administrador.
2. **People** → **Add user** (ej. `sgc_web`).
3. Contraseña robusta; marque **Staff** solo si no es necesario (recomendado: usuario normal).
4. **Groups**: asígnelo a un grupo que ya pueda ver las capas catastrales  
   (o cree el grupo **SGC-Web** y dé permisos de **view** a las capas necesarias).
5. En cada capa restringida: **Share** → permiso de **view** para ese grupo o usuario.

Compruebe en el navegador (sesión iniciada como `sgc_web`) que ve las capas en el mapa de GeoNode.

## 2. Configurar `.env` en SGC-Web

```env
GEONODE_URL=https://www.geomexicali.info
GEOSERVER_PATH=/geoserver

GEONODE_USER=sgc_web
GEONODE_PASSWORD=contraseña_segura_aqui

GEONODE_WMS_LAYERS=geonode:limite_municipal_mexicali,geonode:colonias,geonode:prediosmxli
GEONODE_WMS_LAYER_TITLES=Límite municipal,Colonias,Predios Mexicali
```

Reinicie la API después de guardar `.env`.

## 3. Verificar

```text
GET http://localhost:8000/api/v1/geonode/status
```

Respuesta esperada:

```json
{
  "ok": true,
  "credentials_configured": true,
  "message": "WMS accesible con las credenciales del servicio",
  "test_layer": "geonode:colonias"
}
```

Si `ok: false` y `http_status: 401` o `403`:

- Usuario o contraseña incorrectos.
- El usuario no tiene permiso **view** sobre la capa de prueba.
- GeoServer no acepta Basic Auth (poco común en GeoNode; ver sección siguiente).

## 4. Authkey (opcional)

Si su GeoServer usa el plugin **authkey** en lugar de usuario/contraseña:

```env
GEONODE_AUTH_KEY=su_clave_generada_en_geoserver
```

Deje `GEONODE_USER` vacío solo si el servidor acepta únicamente authkey.

## 5. Seguridad en producción

- No suba `.env` a repositorios públicos.
- Use HTTPS en GeoMexicali y en SGC-Web.
- Rotación periódica de contraseña del usuario `sgc_web`.
- Permisos mínimos: solo **lectura** de capas necesarias.
- En el futuro: usuario LDAP/Active Directory vinculado a GeoNode (misma idea: cuenta de servicio).

## 6. Relación con login de SGC-Web

Hoy el proxy usa **una** cuenta técnica para el mapa base. El login de operadores del catastro (JWT/OIDC) es independiente y se puede añazar después; no sustituye los permisos de GeoNode para las capas WMS.
