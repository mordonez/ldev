package dev.mordonez.liferay.cli.bootstrap.internal;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;

public class LiferayCliOAuth2BootstrapComponentTest {

    @Test
    public void resolveReadOnlyScopeAliases_dropsOnlyExplicitWriteScopes() {
        List<String> aliases = Arrays.asList(
            "Liferay.Headless.Admin.User.everything.read",
            "Liferay.Headless.Admin.User.everything.write",
            "custom.scope.execute",
            " liferay-json-web-services.everything.read "
        );

        List<String> readOnlyAliases = OAuth2ScopeAliasUtil.resolveReadOnlyScopeAliases(aliases);

        assertEquals(
            Arrays.asList(
                "Liferay.Headless.Admin.User.everything.read",
                "custom.scope.execute",
                "liferay-json-web-services.everything.read"
            ),
            readOnlyAliases
        );
    }

    @Test
    public void resolveReadOnlyScopeAliases_handlesNullInput() {
        assertEquals(Collections.emptyList(), OAuth2ScopeAliasUtil.resolveReadOnlyScopeAliases(null));
    }
}
