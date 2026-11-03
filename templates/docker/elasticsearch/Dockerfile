# ELASTICSEARCH_VERSION comes from docker/.env: 7.17.x for DXP 2025 and earlier,
# 8.19.x for DXP 2026.q1+ (elasticsearch8 connector). `ldev project init` sets it.
ARG ELASTICSEARCH_VERSION=7.17.26
FROM docker.elastic.co/elasticsearch/elasticsearch:${ELASTICSEARCH_VERSION}

# Plugins required by Liferay DXP for multilingual analysis
# Same plugins included in Liferay's embedded sidecar
RUN elasticsearch-plugin install --batch \
    analysis-icu \
    analysis-kuromoji \
    analysis-smartcn \
    analysis-stempel \
    analysis-ukrainian
