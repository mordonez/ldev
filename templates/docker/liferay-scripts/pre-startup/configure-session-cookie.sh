#!/bin/bash
set -eu

CATALINA_BASE_DIR="${CATALINA_BASE:-/opt/liferay/tomcat}"
ROOT_CONTEXT_XML="${CATALINA_BASE_DIR}/conf/Catalina/localhost/ROOT.xml"
COOKIE_NAME="${LIFERAY_SESSION_COOKIE_NAME:-}"

if [ -z "${COOKIE_NAME}" ]; then
	COOKIE_NAME="JSESSIONID_${LIFERAY_HTTP_PORT:-8080}"
fi

COOKIE_NAME="$(printf '%s' "${COOKIE_NAME}" | tr -c '[:alnum:]_' '_')"

mkdir -p "$(dirname "${ROOT_CONTEXT_XML}")"

if [ -f "${ROOT_CONTEXT_XML}" ]; then
	if grep -q 'sessionCookieName=' "${ROOT_CONTEXT_XML}"; then
		sed -i "s/sessionCookieName=\"[^\"]*\"/sessionCookieName=\"${COOKIE_NAME}\"/g" "${ROOT_CONTEXT_XML}"
	else
		sed -i "0,/<Context\\b/s/<Context\\b/<Context sessionCookieName=\"${COOKIE_NAME}\"/" "${ROOT_CONTEXT_XML}"
	fi
else
	cat > "${ROOT_CONTEXT_XML}" <<EOF
<Context sessionCookieName="${COOKIE_NAME}" />
EOF
fi

echo "[session-cookie] Using ${COOKIE_NAME}"
