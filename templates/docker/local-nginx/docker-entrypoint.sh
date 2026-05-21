#!/bin/sh
set -eu

CERT_DIR=/etc/nginx/certs
CA_KEY="$CERT_DIR/ca.key"
CA_CERT="$CERT_DIR/ca.crt"
LEAF_KEY="$CERT_DIR/localhost.key"
LEAF_CERT="$CERT_DIR/localhost.crt"

mkdir -p "$CERT_DIR"

if [ ! -f "$CA_KEY" ] || [ ! -f "$CA_CERT" ]; then
    openssl genrsa -out "$CA_KEY" 4096 2>/dev/null
    openssl req -x509 -new -nodes \
        -key "$CA_KEY" \
        -sha256 \
        -days 3650 \
        -out "$CA_CERT" \
        -subj "/CN=ldev Local Development CA" \
        -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
        -addext "keyUsage=critical,keyCertSign,cRLSign" \
        -addext "subjectKeyIdentifier=hash"
fi

if [ ! -f "$LEAF_KEY" ] || [ ! -f "$LEAF_CERT" ]; then
    openssl genrsa -out "$LEAF_KEY" 2048 2>/dev/null
    openssl req -new -key "$LEAF_KEY" \
        -subj "/CN=localhost" \
        -out /tmp/localhost.csr

    cat > /tmp/san.ext << 'SAN_EOF'
subjectAltName=DNS:localhost,IP:127.0.0.1
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
basicConstraints=CA:FALSE
SAN_EOF

    openssl x509 -req \
        -in /tmp/localhost.csr \
        -CA "$CA_CERT" \
        -CAkey "$CA_KEY" \
        -CAcreateserial \
        -days 825 \
        -sha256 \
        -extfile /tmp/san.ext \
        -out "$LEAF_CERT"

    rm -f /tmp/localhost.csr /tmp/san.ext "$CERT_DIR/ca.srl" 2>/dev/null || true
fi

envsubst '${LIFERAY_HTTPS_PORT}' \
    < /etc/nginx/ldev/default.conf \
    > /etc/nginx/conf.d/default.conf

exec "$@"
