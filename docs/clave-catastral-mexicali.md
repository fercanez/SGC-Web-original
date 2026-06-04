# Clave catastral — prediosmxli (Mexicali)

En la capa GeoServer **`geonode:prediosmxli`**, la clave catastral única e irrepetible está en el campo **`clavecatas`**.

## Estructura

Ejemplo: **`ST002001`**

| Segmento | Ejemplo | Longitud | Descripción |
|----------|---------|----------|-------------|
| Homoclave | `ST` | 2 o 3 alfanuméricos | Identificador de sector/zona/colonia |
| Manzana | `002` | 3 dígitos | Número de manzana |
| Lote / depto. | `001` | 3 dígitos | Número de lote o departamento |

**Longitud total:** 8 caracteres (homoclave de 2) u **9** (homoclave de 3).

Otros ejemplos válidos: `ABC015023`, `XY012045`.

## Configuración SGC-Web

```env
CADASTRAL_CODE_PATTERN=^[A-Za-z0-9]{2,3}[0-9]{6}$
GEONODE_FIELD_CADASTRAL=clavecatas
GEONODE_FIELD_PREDIAL=clavecatas
GEONODE_SOURCE_LAYER=geonode:prediosmxli
```

- **Sincronización WFS:** lee `clavecatas` y lo guarda como `cadastral_code` en PostGIS.
- **Alta manual:** valida contra `CADASTRAL_CODE_PATTERN`.
- La API pública `/api/v1/config` expone `cadastral.example` = `ST002001` y el texto de ayuda.

## Verificar un predio en GeoServer

```bash
curl -s -u "USUARIO:CLAVE" \
  "http://192.168.116.132/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=geonode:prediosmxli&count=1&outputFormat=application/json" \
  | head -c 600
```

Busque `"clavecatas": "ST002001"` (u otro valor real) en `properties`.
