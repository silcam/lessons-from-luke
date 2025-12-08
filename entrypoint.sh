#!/bin/bash
set -e

# Start Postgres cluster
echo "Starting PostgreSQL 13..."
su - postgres -c "pg_ctlcluster 13 main start"

su - postgres -c "psql -v ON_ERROR_STOP=1 --dbname=postgres -c \
    \"CREATE USER \\\"lessons-from-luke\\\" WITH PASSWORD 'lessons-from-luke';\""

su - postgres -c "psql -v ON_ERROR_STOP=1 --dbname=postgres -c \
    \"CREATE DATABASE \\\"lessons-from-luke\\\" OWNER \\\"lessons-from-luke\\\";\""

exec "$@"
