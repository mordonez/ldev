package dev.mordonez.ldev.oauth2.app.internal;

import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

class OAuth2ScopeAliasUtil {

    static List<String> resolveReadOnlyScopeAliases(List<String> allScopeAliases) {
        return sanitizeScopeAliases(allScopeAliases).stream()
            .filter(alias -> !isWriteScopeAlias(alias))
            .collect(Collectors.toList());
    }

    static List<String> resolveWriteScopeAliases(List<String> allScopeAliases) {
        return sanitizeScopeAliases(allScopeAliases).stream()
            .filter(OAuth2ScopeAliasUtil::isWriteScopeAlias)
            .collect(Collectors.toList());
    }

    private static List<String> sanitizeScopeAliases(List<String> allScopeAliases) {
        return Optional.ofNullable(allScopeAliases)
            .orElse(Collections.emptyList())
            .stream()
            .filter(alias -> alias != null && !alias.trim().isEmpty())
            .map(String::trim)
            .collect(Collectors.toList());
    }

    private static boolean isWriteScopeAlias(String scopeAlias) {
        return scopeAlias.endsWith(".write");
    }
}
