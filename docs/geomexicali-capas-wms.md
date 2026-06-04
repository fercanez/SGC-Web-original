# Capas WMS — GeoMexicali (portal público)

> **Su VM local** (`192.168.116.132`) usa otros nombres de capa. Vea [geoserver-capas-vm.md](geoserver-capas-vm.md).

Servidor: [https://www.geomexicali.info](https://www.geomexicali.info)  
Endpoint WMS: `https://www.geomexicali.info/geoserver/wms`

## Capas sugeridas para SGC-Web (visor) — portal público

| Orden | Nombre WMS (`LAYERS=`) | Título en GeoServer |
|-------|------------------------|---------------------|
| 1 | `geonode:limite_municipal_de_mexciali_oficial` | Límite Municipal Oficial de Mexicali |
| 2 | `geonode:colonias` | colonias |
| 3 | `geonode:estructura_vial` | estructura_vial |
| 4 | `geonode:predios_mexicali` | predios_mexicali |

## Capas en su GeoServer local (VM)

| Título | Nombre WMS/WFS |
|--------|----------------|
| Limite municipal | `geonode:limite_municipal_mexicali` |
| Colonias | `geonode:colonias` |
| **Predios Mexicali** | **`geonode:prediosmxli`** |
| codigos_postales_bc | `geonode:codigos_postales_bc` |
| predios_ensenada | `geonode:predios_ensenada` |
| predios_tecate | `geonode:predios_tecate` |

La capa **`geonode:prediosmxli`** es el **origen oficial** en SGC-Web (WMS + WFS → PostGIS).

## Marco geográfico (Capabilities)

- **EPSG soportados en servicio:** 4326, 3857, 32611, 32647, …
- **Extensión municipal (EPSG:4326):** aprox. lon -117.12 a -112.56, lat 27.96 a 32.74

## Catálogo vectorial `geonode:*` (catastro / planeación)

| Nombre WMS | Título |
|------------|--------|
| `geonode:predios_mexicali` | predios_mexicali |
| `geonode:predios_region` | predios_region |
| `geonode:predios_con_uso` | Usos de Suelo por Tasa |
| `geonode:predios_baldios` | predios_baldios |
| `geonode:sectores` | sectores |
| `geonode:seccion_mexicali` | seccion_mexicali |
| `geonode:colonias` | colonias |
| `geonode:codigos_postales_2025` | Códigos Postales Mexicali 2025 |
| `geonode:estructura_vial` | estructura_vial |
| `geonode:calles_unifilar` | calles_unifilar |
| `geonode:limite_municipal_de_mexciali_oficial` | Límite Municipal Oficial |
| `geonode:limite_de_area_urbana_al_2040` | Área urbana al 2040 |
| `geonode:usos_prop_au40` | (usos planeación) |
| `geonode:zonas_homogeneas_2017_2026_prop` | Zonas homogéneas |
| `geonode:avaluos_rusticos` | Avalúos rústicos |

## Capas raster `imagenes:*` (ortofotos / colonias)

Ejemplos: `imagenes:Colonia Pacifico`, `imagenes:Ejido Oaxaca`, `imagenes:benitojuarez`, etc.  
Útiles como fondo de alta resolución en zonas específicas (EPSG:32611 en origen).

## Tributación / adeudos (si aplica al módulo)

`geonode:predios_adeudo_2026`, `geonode:p_adeudo_marzo_26`, `geonode:predios_adeudos_abril_2026`, …

## Nota sobre “Localización Cartográfica”

En el portal GeoNode puede aparecer como mapa o categoría; en GetCapabilities **no hay** una capa con ese nombre exacto. Use el **nombre WMS** (`geonode:...`) de la tabla anterior.

## Prueba GetMap

```
https://www.geomexicali.info/geoserver/wms?service=WMS&version=1.1.1&request=GetMap
&layers=geonode:colonias
&bbox=-115.6,32.5,-115.3,32.7
&width=800&height=600&srs=EPSG:4326&format=image/png
```
