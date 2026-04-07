package dev.mordonez.ldev.oauth2.app.internal;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

class LdevOAuth2BootstrapSupport {

    static final String PORTAL_INVENTORY_SCOPE_ALIAS = "Liferay.Headless.Admin.Site.everything.read";

    static List<String> resolveManagedScopeAliases(List<String> configuredScopeAliases) {
        Set<String> aliases = new LinkedHashSet<String>();

        if (configuredScopeAliases != null) {
            for (String configuredScopeAlias : configuredScopeAliases) {
                if (configuredScopeAlias != null) {
                    String normalizedScopeAlias = configuredScopeAlias.trim();

                    if (!normalizedScopeAlias.isEmpty()) {
                        aliases.add(normalizedScopeAlias);
                    }
                }
            }
        }

        aliases.add(PORTAL_INVENTORY_SCOPE_ALIAS);

        return new ArrayList<String>(aliases);
    }

    private LdevOAuth2BootstrapSupport() {
    }
}
