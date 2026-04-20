package dev.mordonez.ldev.oauth2.app.configuration;

import aQute.bnd.annotation.metatype.Meta;

@Meta.OCD(
    id = "dev.mordonez.ldev.oauth2.app.configuration.LdevOAuth2AppConfiguration",
    name = "ldev OAuth2 App"
)
public interface LdevOAuth2AppConfiguration {

    @Meta.AD(deflt = "false", required = false)
    boolean enabled();

    @Meta.AD(deflt = "0", required = false)
    long companyId();

    @Meta.AD(deflt = "0", required = false)
    long userId();

    @Meta.AD(deflt = "ldev", required = false)
    String externalReferenceCode();

    @Meta.AD(deflt = "ldev", required = false)
    String appName();

    @Meta.AD(deflt = "", required = false)
    String clientId();

    @Meta.AD(deflt = "", required = false)
    String clientSecret();

    @Meta.AD(deflt = "false", required = false)
    boolean rotateClientSecret();

    @Meta.AD(deflt = "client_secret_basic", required = false)
    String clientAuthenticationMethod();

    @Meta.AD(
        deflt = "Liferay.Headless.Admin.User.everything.read,Liferay.Headless.Admin.Content.everything.read,Liferay.Headless.Admin.Site.everything.read,Liferay.Data.Engine.REST.everything.read,Liferay.Data.Engine.REST.everything.write,Liferay.Headless.Delivery.everything.read,Liferay.Headless.Delivery.everything.write,liferay-json-web-services.everything.read,liferay-json-web-services.everything.write,Liferay.Headless.Discovery.API.everything.read,Liferay.Headless.Discovery.OpenAPI.everything.read",
        required = false
    )
    String[] scopeAliases();
}
