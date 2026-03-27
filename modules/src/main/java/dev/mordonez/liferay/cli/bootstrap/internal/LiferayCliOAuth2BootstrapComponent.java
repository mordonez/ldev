package dev.mordonez.liferay.cli.bootstrap.internal;

import com.liferay.oauth2.provider.constants.GrantType;
import com.liferay.oauth2.provider.model.OAuth2Application;
import com.liferay.oauth2.provider.service.OAuth2ApplicationLocalService;
import com.liferay.portal.configuration.metatype.bnd.util.ConfigurableUtil;
import com.liferay.portal.kernel.exception.PortalException;
import com.liferay.portal.kernel.log.Log;
import com.liferay.portal.kernel.log.LogFactoryUtil;
import com.liferay.portal.kernel.model.Company;
import com.liferay.portal.kernel.model.User;
import com.liferay.portal.kernel.service.CompanyLocalService;
import com.liferay.portal.kernel.service.ServiceContext;
import com.liferay.portal.kernel.service.UserLocalService;
import com.liferay.portal.kernel.util.GetterUtil;
import com.liferay.portal.kernel.util.Validator;
import dev.mordonez.liferay.cli.bootstrap.configuration.LiferayCliOAuth2BootstrapConfiguration;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Modified;
import org.osgi.service.component.annotations.Reference;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Bootstrap component for OAuth2 application to allow CLI access.
 *
 * It is idempotent and will update the application on startup if it already exists.
 *
 * @author mordonez
 */
@Component(
    configurationPid = "dev.mordonez.liferay.cli.bootstrap.configuration.LiferayCliOAuth2BootstrapConfiguration",
    immediate = true,
    service = {}
)
public class LiferayCliOAuth2BootstrapComponent {

    @Activate
    @Modified
    protected void activate(Map<String, Object> properties) {
        _configuration = ConfigurableUtil.createConfigurable(LiferayCliOAuth2BootstrapConfiguration.class, properties);

        if (!resolveEnabled()) {
            if (_log.isDebugEnabled()) {
                _log.debug("Liferay CLI OAuth2 Bootstrap is disabled.");
            }
            return;
        }

        // Delay execution slightly to ensure portal is ready and technical user exists
        // (common issue during first boot)
        executeWithRetry(this::upsertOAuth2Applications, 5, 2000);
    }

    private boolean resolveEnabled() {
        return resolveBoolean(_configuration.enabled(), "LIFERAY_CLI_OAUTH2_ENABLED");
    }

    private void upsertOAuth2Applications() throws PortalException {
        String companyWebId = resolveString(_configuration.companyWebId(), "LIFERAY_CLI_OAUTH2_COMPANY_WEB_ID");
        Company company = resolveCompany(companyWebId);

        String adminEmail = resolveString(_configuration.adminEmail(), "LIFERAY_CLI_OAUTH2_ADMIN_EMAIL");
        User adminUser = _userLocalService.fetchUserByEmailAddress(company.getCompanyId(), adminEmail);

        if (adminUser == null) {
            throw new PortalException("Admin user not found: " + adminEmail);
        }

        String externalReferenceCode = resolveString(
            _configuration.externalReferenceCode(), "LIFERAY_CLI_OAUTH2_EXTERNAL_REFERENCE_CODE");
        String appName = resolveString(_configuration.appName(), "LIFERAY_CLI_OAUTH2_APP_NAME");
        List<String> allScopeAliases = resolveScopeAliases();

        // Full-access app (read + write scopes)
        upsertOAuth2Application(
            company, adminUser,
            externalReferenceCode, appName,
            allScopeAliases, _configuration.clientId(), resolveClientSecret());

        List<String> readOnlyScopeAliases = resolveReadOnlyScopeAliases(allScopeAliases);

        // Pass an empty clientId so it is auto-generated on first creation
        // (Validator.isNotNull("") returns false, triggering auto-generation).
        upsertOAuth2Application(
            company, adminUser,
            externalReferenceCode + "-readonly", appName + "-readonly",
            readOnlyScopeAliases, "", "secret-" + UUID.randomUUID());
    }

    private Company resolveCompany(String configuredWebId) throws PortalException {
        try {
            return _companyLocalService.getCompanyByWebId(configuredWebId);
        } catch (PortalException exception) {
            List<Company> companies = _companyLocalService.getCompanies();

            if (companies.isEmpty()) {
                throw exception;
            }

            Company fallbackCompany = companies.get(0);

            if (_log.isWarnEnabled()) {
                _log.warn(
                    "Company webId '" + configuredWebId + "' not found. Falling back to company '" +
                        fallbackCompany.getWebId() + "' (" + fallbackCompany.getCompanyId() + ").");
            }

            return fallbackCompany;
        }
    }

    private void upsertOAuth2Application(
            Company company, User adminUser,
            String externalReferenceCode, String appName,
            List<String> scopeAliases, String configuredClientId, String newClientSecret)
        throws PortalException {

        boolean rotateSecret = _configuration.rotateClientSecret();
        String clientSecret = newClientSecret;

        OAuth2Application oAuth2Application = _oAuth2ApplicationLocalService.fetchOAuth2ApplicationByExternalReferenceCode(
            externalReferenceCode, company.getCompanyId());

        boolean existed = oAuth2Application != null;

        // Use existing clientId when app already exists to avoid breaking active sessions.
        // On first creation, use the configured value or generate a random one.
        String clientId;
        if (existed) {
            clientId = oAuth2Application.getClientId();
            if (!rotateSecret && Validator.isNotNull(oAuth2Application.getClientSecret())) {
                clientSecret = oAuth2Application.getClientSecret();
            }
        } else {
            clientId = Validator.isNotNull(configuredClientId)
                ? configuredClientId
                : externalReferenceCode + "-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        }

        ServiceContext serviceContext = new ServiceContext();
        serviceContext.setCompanyId(company.getCompanyId());
        serviceContext.setUserId(adminUser.getUserId());

        _oAuth2ApplicationLocalService.addOrUpdateOAuth2Application(
            externalReferenceCode,
            adminUser.getUserId(),
            adminUser.getFullName(),
            Collections.singletonList(GrantType.CLIENT_CREDENTIALS),
            _configuration.clientAuthenticationMethod(),
            adminUser.getUserId(),
            clientId,
            4,// Confidential
            clientSecret,
            "OAUTH2 App for " + appName,
            Collections.emptyList(),
            "",
            0L,
            "",
            appName,
            "",
            Collections.emptyList(),
            false,
            scopeAliases,
            false,
            serviceContext
        );

        // Ensure name and description are always correct (addOrUpdate may skip fields on update)
        oAuth2Application = _oAuth2ApplicationLocalService.fetchOAuth2ApplicationByExternalReferenceCode(
            externalReferenceCode, company.getCompanyId());

        if (oAuth2Application != null) {
            oAuth2Application.setName(appName);
            if (existed && (rotateSecret || Validator.isBlank(oAuth2Application.getClientSecret()))) {
                oAuth2Application.setClientSecret(clientSecret);
            }
            _oAuth2ApplicationLocalService.updateOAuth2Application(oAuth2Application);
        }

        _log.info(String.format(
            "OAuth2 app '%s' %s (clientId=%s). Run 'task osgi:liferaycli-creds' to retrieve credentials.",
            appName, existed ? "updated" : "created", clientId));
    }

    private List<String> resolveScopeAliases() {
        return Optional.ofNullable(_configuration.scopeAliases())
            .map(aliases -> Arrays.stream(aliases)
                .filter(Validator::isNotNull)
                .map(String::trim)
                .filter(Validator::isNotNull)
                .collect(Collectors.toList()))
            .orElse(Collections.emptyList());
    }

    static List<String> resolveReadOnlyScopeAliases(List<String> allScopeAliases) {
        List<String> readOnlyScopeAliases = OAuth2ScopeAliasUtil.resolveReadOnlyScopeAliases(allScopeAliases);
        List<String> droppedAliases = OAuth2ScopeAliasUtil.resolveWriteScopeAliases(allScopeAliases);

        if (!droppedAliases.isEmpty() && _log.isWarnEnabled()) {
            _log.warn(
                "Skipping write scope aliases for readonly OAuth2 app: " + String.join(", ", droppedAliases));
        }

        return readOnlyScopeAliases;
    }

    private String resolveClientSecret() {
        String configValue = _configuration.clientSecret();
        if (Validator.isNotNull(configValue)) {
            return configValue.trim();
        }

        return "secret-" + UUID.randomUUID();
    }

    private String resolveString(String configValue, String envKey) {
        String envValue = System.getenv(envKey);
        return Validator.isNotNull(envValue) ? envValue.trim() : configValue;
    }

    private boolean resolveBoolean(boolean configValue, String envKey) {
        String envValue = System.getenv(envKey);
        return Validator.isNotNull(envValue) ? GetterUtil.getBoolean(envValue) : configValue;
    }

    private void executeWithRetry(RunnableWithPortalException task, int maxRetries, long delay) {
        for (int i = 1; i <= maxRetries; i++) {
            try {
                task.run();
                return;
            } catch (Exception e) {
                if (i == maxRetries) {
                    _log.error("Liferay CLI OAuth2 Bootstrap failed after " + maxRetries + " retries", e);
                } else {
                    _log.warn("Liferay CLI OAuth2 Bootstrap attempt " + i + " failed. Retrying in " + delay + "ms...");
                    try {
                        Thread.sleep(delay);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }
        }
    }

    @FunctionalInterface
    private interface RunnableWithPortalException {
        void run() throws PortalException;
    }

    private static final Log _log = LogFactoryUtil.getLog(LiferayCliOAuth2BootstrapComponent.class);

    private volatile LiferayCliOAuth2BootstrapConfiguration _configuration;

    @Reference
    private CompanyLocalService _companyLocalService;

    @Reference
    private OAuth2ApplicationLocalService _oAuth2ApplicationLocalService;

    @Reference
    private UserLocalService _userLocalService;
}
