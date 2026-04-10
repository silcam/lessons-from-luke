#!/bin/bash
set -e

# Start Postgres cluster (detect installed version)
PG_VERSION=$(ls /etc/postgresql/ | sort -V | tail -1)
echo "Starting PostgreSQL ${PG_VERSION}..."
su - postgres -c "pg_ctlcluster ${PG_VERSION} main start"

# Create database user and databases (ignore errors if they already exist)
su - postgres -c "psql -v ON_ERROR_STOP=0 --dbname=postgres -c \
    \"CREATE USER \\\"lessons-from-luke\\\" WITH PASSWORD 'lessons-from-luke';\"" 2>/dev/null || true

su - postgres -c "psql -v ON_ERROR_STOP=0 --dbname=postgres -c \
    \"CREATE DATABASE \\\"lessons-from-luke\\\" OWNER \\\"lessons-from-luke\\\";\"" 2>/dev/null || true

su - postgres -c "psql -v ON_ERROR_STOP=0 --dbname=postgres -c \
    \"CREATE DATABASE \\\"lessons-from-luke-test\\\" OWNER \\\"lessons-from-luke\\\";\"" 2>/dev/null || true

# Generate secrets.json if it doesn't exist
if [ ! -f /workspace/secrets.json ]; then
    cat > /workspace/secrets.json <<'SECRETS'
{
  "cookieSecret": "fuerabgui4pab5m32;tkqipn84",
  "adminUsername": "chris",
  "adminPassword": "yo",
  "db": {
    "database": "lessons-from-luke",
    "username": "lessons-from-luke",
    "password": "lessons-from-luke"
  },
  "testDb": {
    "database": "lessons-from-luke-test",
    "username": "lessons-from-luke",
    "password": "lessons-from-luke"
  }
}
SECRETS
fi

exec "$@"
