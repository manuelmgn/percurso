#!/bin/sh
# Entrypoint: runs the container command as the unprivileged "app" user.
# Named volumes are root-owned by default, so (as root only) fix ownership of
# the mount points and the backup log before dropping privileges.
set -e

if [ "$(id -u)" -eq 0 ]; then
    mkdir -p /data /app/uploads /app/tile-cache /app/backups /backups
    chown -R app:app /data /app/uploads /app/tile-cache /app/backups
    touch /var/log/percursos-backup.log
    chown app:app /var/log/percursos-backup.log
    exec gosu app "$@"
fi

exec "$@"
