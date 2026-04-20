package dev.mordonez.ldev.oauth2.app.internal;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;

public class LdevOAuth2BootstrapSupportTest {

    @Test
    public void resolveManagedScopeAliases_appendsPortalInventoryAliasOnce() {
        List<String> aliases = LdevOAuth2BootstrapSupport.resolveManagedScopeAliases(
            Arrays.asList(
                "Liferay.Headless.Admin.User.everything.read",
                "Liferay.Headless.Admin.Content.everything.read",
                "Liferay.Headless.Admin.Site.everything.read",
                " liferay-json-web-services.everything.read "
            )
        );

        assertEquals(
            Arrays.asList(
                "Liferay.Headless.Admin.User.everything.read",
                "Liferay.Headless.Admin.Content.everything.read",
                "Liferay.Headless.Admin.Site.everything.read",
                "liferay-json-web-services.everything.read"
            ),
            aliases
        );
    }

    @Test
    public void resolveManagedScopeAliases_handlesNullInput() {
        assertEquals(
            Collections.singletonList(LdevOAuth2BootstrapSupport.PORTAL_INVENTORY_SCOPE_ALIAS),
            LdevOAuth2BootstrapSupport.resolveManagedScopeAliases(null)
        );
    }
}
