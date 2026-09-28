FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./
COPY app ./app

RUN pip install --no-cache-dir .

# 默认数据目录，docker-compose 会挂载宿主机目录到 /data
RUN mkdir -p /data

EXPOSE 8000

# 识别 worker 在进程内运行，必须单进程启动，不要加 --workers
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
