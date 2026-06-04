FROM python:3.12-slim

WORKDIR /app

# Sin apt-get: psycopg[binary] y shapely usan wheels; evita fallos DNS en docker build.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000"]
