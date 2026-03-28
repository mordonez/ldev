package dev.mordonez.liferay.cli.bootstrap.configuration;

import aQute.bnd.annotation.metatype.Meta;

@Meta.OCD(
    id = "dev.mordonez.liferay.cli.bootstrap.configuration.LiferayCliOAuth2BootstrapConfiguration",
    name = "Liferay CLI OAuth2 Bootstrap"
)
public interface LiferayCliOAuth2BootstrapConfiguration {

    @Meta.AD(deflt = "true", required = false)
    boolean enabled();

    @Meta.AD(deflt = "liferay.com", required = false)
    String companyWebId();

    @Meta.AD(deflt = "test@liferay.com", required = false)
    String adminEmail();

    @Meta.AD(deflt = "liferay-cli", required = false)
    String externalReferenceCode();

    @Meta.AD(deflt = "liferay-cli", required = false)
    String appName();

    @Meta.AD(deflt = "", required = false)
    String clientId();

    @Meta.AD(deflt = "", required = false)
    String clientSecret();

    @Meta.AD(deflt = "false", required = false)
    boolean rotateClientSecret();

    @Meta.AD(deflt = "client_secret_post", required = false)
    String clientAuthenticationMethod();

    @Meta.AD(
        deflt = "Liferay.Headless.Admin.User.everything.read,Liferay.Headless.Admin.Content.everything.read,Liferay.Data.Engine.REST.everything.read,Liferay.Data.Engine.REST.everything.write,Liferay.Headless.Delivery.everything.read,Liferay.Headless.Delivery.everything.write,liferay-json-web-services.everything.read,liferay-json-web-services.everything.write",
        required = false
    )
    String[] scopeAliases();
}
