FROM elasticsearch:7.17.26

# Plugins required by Liferay DXP for multilingual analysis
# Same plugins included in Liferay's embedded sidecar
RUN elasticsearch-plugin install --batch \
    analysis-icu \
    analysis-kuromoji \
    analysis-smartcn \
    analysis-stempel \
    analysis-ukrainian
