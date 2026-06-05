#!/bin/bash
set -euo pipefail

ADMIN_JSON="/opt/liferay/glowroot/admin.json"

if [ ! -f "$ADMIN_JSON" ]; then
	echo "[glowroot] admin.json not found, skipping"
	exit 0
fi

sed -i \
	-e 's/"bindAddress"[[:space:]]*:[[:space:]]*"127\.0\.0\.1"/"bindAddress": "0.0.0.0"/' \
	-e 's/"port"[[:space:]]*:[[:space:]]*4000/"port": 4000/' \
	"$ADMIN_JSON"

echo "[glowroot] UI configured on 0.0.0.0:4000"
