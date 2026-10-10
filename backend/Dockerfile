FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml ./

# 依赖层只依赖 pyproject.toml；业务代码更新不会重新下载依赖。
# 从项目配置提取依赖，避免维护两份依赖清单。
ARG PIP_INDEX_URL=https://pypi.org/simple
RUN python -c "import pathlib, tomllib; deps = tomllib.loads(pathlib.Path('pyproject.toml').read_text(encoding='utf-8'))['project']['dependencies']; pathlib.Path('/tmp/requirements.txt').write_text('\n'.join(deps) + '\n', encoding='utf-8')" \
    && pip install --no-cache-dir --index-url "$PIP_INDEX_URL" -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

# /app 位于 Python 导入路径，uvicorn 直接加载源码，无需重新安装项目包。
COPY app ./app

# 默认数据目录，docker-compose 会挂载宿主机目录到 /data
RUN mkdir -p /data

EXPOSE 8000

# 识别 worker 在进程内运行，必须单进程启动，不要加 --workers
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]
