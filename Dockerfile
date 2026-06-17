# Dockerfile na RAIZ do repositório — permite `fly deploy` a partir da raiz.
# (existe também prototipo/backend/Dockerfile para deploy de dentro daquela pasta)
# Contexto de build = raiz do repo; os COPY apontam para prototipo/backend/.
FROM python:3.12-slim

WORKDIR /app

COPY prototipo/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY prototipo/backend/agents/     agents/
COPY prototipo/backend/api/        api/
COPY prototipo/backend/engine/     engine/
COPY prototipo/backend/utils/      utils/
COPY prototipo/backend/config.py   config.py
COPY prototipo/backend/database.py database.py
COPY prototipo/backend/main.py     main.py

RUN mkdir -p data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
