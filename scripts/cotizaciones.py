"""Baja las cotizaciones de la cinta del portafolio y las imprime como JSON.

Lo ejecuta la GitHub Action .github/workflows/cotizaciones.yml cada 15 minutos
en horario bursátil; el resultado se publica en la rama `datos` y el sitio lo
lee desde raw.githubusercontent.com (los navegadores no pueden consultar Yahoo
directamente por CORS). Solo usa la biblioteca estándar.
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

# (símbolo en Yahoo, etiqueta en la cinta, decimales)
SIMBOLOS = [
    ("CLP=X", "USD/CLP", 2),
    ("SQM-B.SN", "SQM-B", 0),
    ("CHILE.SN", "BCO CHILE", 2),
    ("FALABELLA.SN", "FALABELLA", 0),
    ("COPEC.SN", "COPEC", 0),
    ("LTM.SN", "LATAM", 2),
    ("CENCOSUD.SN", "CENCOSUD", 0),
    ("ECH", "MSCI CHILE", 2),
    ("HG=F", "COBRE", 3),
    ("^GSPC", "S&P 500", 0),
    ("^IXIC", "NASDAQ", 0),
    ("^DJI", "DOW", 0),
    ("AAPL", "APPLE", 2),
    ("MSFT", "MICROSOFT", 2),
    ("NVDA", "NVIDIA", 2),
    ("AMZN", "AMAZON", 2),
    ("GC=F", "ORO", 0),
    ("CL=F", "PETRÓLEO", 2),
    ("EURUSD=X", "EUR/USD", 4),
    ("BTC-USD", "BITCOIN", 0),
]

URL = "https://query1.finance.yahoo.com/v8/finance/chart/{}?range=1d&interval=1d"


def cotizar(simbolo):
    req = urllib.request.Request(URL.format(urllib.parse.quote(simbolo)), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        meta = json.load(r)["chart"]["result"][0]["meta"]
    precio = meta.get("regularMarketPrice")
    anterior = meta.get("chartPreviousClose") or meta.get("previousClose")
    if precio is None or not anterior:
        raise ValueError("sin precio")
    return {"p": precio, "c": anterior, "m": meta.get("currency"), "t": meta.get("regularMarketTime")}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    items, fallidos = [], []
    for simbolo, etiqueta, decimales in SIMBOLOS:
        try:
            items.append({"s": etiqueta, "d": decimales, **cotizar(simbolo)})
        except Exception as e:  # un símbolo caído no debe botar toda la cinta
            fallidos.append(f"{simbolo}: {e}")
        time.sleep(0.4)
    if not items:
        sys.exit("No se obtuvo ninguna cotización:\n" + "\n".join(fallidos))
    for f in fallidos:
        print("aviso:", f, file=sys.stderr)
    json.dump({
        "actualizado": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "fuente": "Yahoo Finance",
        "items": items,
    }, sys.stdout, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
