import re
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

PREDIAL_URL = "https://www.mexicali.gob.mx/portalmexicali/predial/presupuesto"


def parse_money(value: str) -> float:
    value = (value or "").strip()
    value = value.replace("$", "").replace(",", "").strip()
    try:
        return float(value)
    except ValueError:
        return 0.0


def consultar_predial_mexicali(clave_catastral: str) -> dict:
    headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://www.mexicali.gob.mx",
        "Referer": "https://www.mexicali.gob.mx/portalmexicali/predial",
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html, */*; q=0.01",
    }

    response = requests.post(
        PREDIAL_URL,
        data={"claveCatastral": clave_catastral},
        headers=headers,
        timeout=30,
    )
    response.raise_for_status()

    html = response.text
    soup = BeautifulSoup(html, "html.parser")

    result = {
        "clave_catastral": clave_catastral,
        "tiene_adeudo": False,
        "estatus_consulta": "sin_adeudo",
        "periodo": None,
        "subtotal_importes": 0.0,
        "sobretasa_seguridad_publica": 0.0,
        "fomento_deportivo": 0.0,
        "rezago_fomento_deportivo": 0.0,
        "servicio_alumbrado": 0.0,
        "recargos": 0.0,
        "multas": 0.0,
        "gastos_ejecucion": 0.0,
        "descuentos": 0.0,
        "donativo_cruz_roja": 0.0,
        "donativo_bomberos": 0.0,
        "total_a_pagar": 0.0,
        "consultado_en": datetime.now(timezone.utc).isoformat(),
        "fuente": "portal_mexicali",
    }

    table = soup.find("table")
    if not table:
        result["estatus_consulta"] = "no_encontrado"
        result["mensaje"] = "No se encontró tabla de resultados en la respuesta."
        return result

    rows = table.find_all("tr")
    labels_to_keys = {
        "Subtotal de importes": "subtotal_importes",
        "Sobretasa en apoyo a Seguridad Pública": "sobretasa_seguridad_publica",
        "Fomento deportivo": "fomento_deportivo",
        "Rezago sobretasa al fomento deportivo": "rezago_fomento_deportivo",
        "Servicio de operación y mantenimiento de alumbrado público": "servicio_alumbrado",
        "Recargos": "recargos",
        "Multas": "multas",
        "Gastos de ejecución": "gastos_ejecucion",
        "Descuentos": "descuentos",
        "Donativo Cruz Roja": "donativo_cruz_roja",
        "Donativo al H. Cuerpo de Bomberos": "donativo_bomberos",
        "Total a pagar": "total_a_pagar",
    }

    for row in rows:
        cols = [c.get_text(" ", strip=True) for c in row.find_all(["td", "th"])]
        if not cols:
            continue

        row_text = " | ".join(cols)

        periodo_match = re.search(r"(\d+/\d{4}\s*-\s*\d+/\d{4})", row_text)
        if periodo_match:
            result["periodo"] = periodo_match.group(1)

        for label, key in labels_to_keys.items():
            if any(label in col for col in cols):
                for col in reversed(cols):
                    if "$" in col:
                        result[key] = parse_money(col)
                        break

    result["tiene_adeudo"] = result["total_a_pagar"] > 0
    result["estatus_consulta"] = (
        "con_adeudo" if result["tiene_adeudo"] else "sin_adeudo"
    )
    return result
