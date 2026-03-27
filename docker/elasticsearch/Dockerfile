FROM elasticsearch:7.17.26

# Plugins requeridos por Liferay DXP para análisis multilingüe
# Mismos plugins que incluye el sidecar embebido de Liferay
RUN elasticsearch-plugin install --batch \
    analysis-icu \
    analysis-kuromoji \
    analysis-smartcn \
    analysis-stempel \
    analysis-ukrainian
