# Imperador Lounge Bar - imagem para o Railway (Python + PostgreSQL)
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    TZ=America/Sao_Paulo \
    NO_BROWSER=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# O Railway define a variável PORT; o app.py já usa PORT e escuta em 0.0.0.0
CMD ["python", "app.py"]
