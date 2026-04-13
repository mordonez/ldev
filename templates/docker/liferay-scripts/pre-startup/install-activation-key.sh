#!/bin/bash
# Install the custom activation key and remove trial licenses.
#
# Each DXP Docker image bundles a trial license (trial-dxp-license-*.xml)
# that expires ~1 month after image creation. This script ensures our
# custom activation key is the only active license by:
#   1. Cleaning cached license data from /opt/liferay/data/license/
#   2. Removing any trial licenses from osgi/modules/
#   3. Deploying our activation key via /opt/liferay/deploy/
#
# Place your activation key in:
#   liferay/configs/dockerenv/osgi/modules/activation-key-*.xml
# (gitignored - never commit the key)
#
# Runs in the Pre-Startup phase (right before Tomcat starts).
# See: https://learn.liferay.com/dxp/self-hosted-installation-and-upgrades/using-liferay-docker-images/licensing-dxp-in-docker

MODULES_DIR="/opt/liferay/osgi/modules"
LICENSE_CACHE="/opt/liferay/data/license"
DEPLOY_DIR="/opt/liferay/deploy"

# 1. Clean cached trial license data (persisted across restarts via liferay-data volume)
if [ -d "$LICENSE_CACHE" ]; then
	rm -rf "${LICENSE_CACHE:?}"/*
	echo "[activation-key] Cleaned license cache"
fi

# 2. Remove any trial licenses already present in osgi/modules
for trial in "$MODULES_DIR"/trial-dxp-license-*.xml; do
	[ -f "$trial" ] || continue
	echo "[activation-key] Removing trial license: $(basename "$trial")"
	rm -f "$trial"
done

# 3. Deploy our activation key via the deploy directory
DEPLOYED=0
for key in "$MODULES_DIR"/activation-key-*.xml; do
	[ -f "$key" ] || continue
	echo "[activation-key] Deploying: $(basename "$key")"
	cp "$key" "$DEPLOY_DIR/"
	DEPLOYED=1
done

if [ "$DEPLOYED" -eq 0 ]; then
	echo "[activation-key] WARNING: No activation key found in osgi/modules/. Place your key in liferay/configs/dockerenv/osgi/modules/activation-key-*.xml"
fi
