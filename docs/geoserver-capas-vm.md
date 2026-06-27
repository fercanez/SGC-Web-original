# Capas GeoServer — VM local (192.168.116.132)

Catálogo según **Previsualización de capas** en GeoServer de su instalación.

## Capas publicadas

| Título en GeoServer | Nombre WMS/WFS (`workspace:capa`) | Uso en SGC-Web |
|---------------------|-----------------------------------|----------------|
| Limite municipal | `geonode:limite_municipal_mexicali` | WMS — marco municipal |
| Colonias | `geonode:colonias` | WMS — contexto urbano |
| **Predios Mexicali** | **`geonode:prediosmxli`** | **WMS + WFS — origen oficial** |
| codigos_postales_bc | `geonode:codigos_postales_bc` | Opcional |
| predios_ensenada | `geonode:predios_ensenada` | No (otro municipio) |
| predios_tecate | `geonode:predios_tecate` | No (otro municipio) |

> **Importante:** el título visible es *Predios Mexicali*, pero el **nombre técnico** en GeoServer es **`prediosmxli`** (sin guión bajo). Use siempre `geonode:prediosmxli` en `.env`.

> **Enlace padron ↔ cartografía:** `padron2026.clave_catastral` = campo **`clavecatas`** en la capa `geonode:prediosmxli` (*Predios Mexicali* / predios_mexicali).

## Configuración `.env` recomendada

```env
GEONODE_WMS_LAYERS=geonode:limite_municipal_mexicali,geonode:colonias,geonode:prediosmxli
GEONODE_WMS_LAYER_TITLES=Límite municipal,Colonias,Predios Mexicali
GEONODE_SOURCE_LAYER=geonode:prediosmxli
GEONODE_SOURCE_TITLE=Predios Mexicali (origen oficial)
GEONODE_FIELD_CADASTRAL=clavecatas
GEONODE_SYNC_GEOMETRY_ONLY=true
CADASTRAL_CODE_PATTERN=^(?:[A-Za-z]{2,3}[0-9]{6}|[A-Za-z][0-9]{7})$
```

Clave catastral: [clave-catastral-mexicali.md](clave-catastral-mexicali.md).

## Prueba WMS (límite municipal)

```
https://192.168.116.132/geoserver/wms?service=WMS&version=1.1.1&request=GetMap
&layers=geonode:limite_municipal_mexicali
&bbox=-115.6,32.5,-115.3,32.7
&width=800&height=600&srs=EPSG:4326&format=image/png
```

## Prueba WFS (origen de predios)

```
https://192.168.116.132/geoserver/wfs?service=WFS&version=2.0.0&request=GetFeature
&typeNames=geonode:prediosmxli&count=1&outputFormat=application/json
```

## Nota sobre geomexicali.info

El portal público [geomexicali.info](https://www.geomexicali.info) puede tener **otros nombres de capa** (p. ej. `limite_municipal_de_mexciali_oficial`). Su VM local usa los nombres de la tabla anterior.
