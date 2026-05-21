#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$DOCKER_DIR/.env"

ENV_DATA_ROOT="./data/default"
if [ -f "$ENV_FILE" ]; then
    val="$(grep -E '^[[:space:]]*ENV_DATA_ROOT[[:space:]]*=' "$ENV_FILE" 2>/dev/null | tail -1 | sed 's/[^=]*=[[:space:]]*//' | tr -d '"'"'" | xargs)" || true
    [ -n "$val" ] && ENV_DATA_ROOT="$val"
fi

case "$ENV_DATA_ROOT" in
    /*) ;;
    *) ENV_DATA_ROOT="$DOCKER_DIR/$ENV_DATA_ROOT" ;;
esac

CA_CERT="$ENV_DATA_ROOT/local-nginx-certs/ca.crt"

if [ ! -f "$CA_CERT" ]; then
    echo "CA cert not found at: $CA_CERT"
    echo "Run 'ldev start' first so the webserver generates its local CA."
    exit 1
fi

case "$(uname -s)" in
    Darwin)
        security add-trusted-cert -d -r trustRoot \
            -k "$HOME/Library/Keychains/login.keychain-db" \
            "$CA_CERT"
        ;;
    Linux)
        sudo cp "$CA_CERT" /usr/local/share/ca-certificates/ldev-local.crt
        sudo update-ca-certificates

        if command -v certutil >/dev/null 2>&1; then
            for db in "$HOME/.pki/nssdb" "$HOME/.mozilla/firefox"/*.default-release "$HOME/.mozilla/firefox"/*.default; do
                [ -d "$db" ] || continue
                certutil -d "sql:$db" -D -n ldev-local 2>/dev/null || true
                certutil -d "sql:$db" -A -t "C,," -n ldev-local -i "$CA_CERT"
            done
        fi
        ;;
    *)
        echo "Unsupported OS. Manually trust: $CA_CERT"
        exit 1
        ;;
esac

echo "Trusted ldev local HTTPS CA. Restart your browser if needed."
