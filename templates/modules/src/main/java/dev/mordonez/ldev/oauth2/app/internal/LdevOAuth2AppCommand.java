package dev.mordonez.ldev.oauth2.app.internal;

import com.liferay.oauth2.provider.constants.GrantType;
import com.liferay.oauth2.provider.model.OAuth2Application;
import com.liferay.oauth2.provider.service.OAuth2ApplicationLocalService;
import com.liferay.portal.configuration.metatype.bnd.util.ConfigurableUtil;
import com.liferay.portal.kernel.exception.PortalException;
import com.liferay.portal.kernel.log.Log;
import com.liferay.portal.kernel.log.LogFactoryUtil;
import com.liferay.portal.kernel.model.Company;
import com.liferay.portal.kernel.model.Role;
import com.liferay.portal.kernel.model.User;
import com.liferay.portal.kernel.module.framework.ModuleServiceLifecycle;
import com.liferay.portal.kernel.service.CompanyLocalService;
import com.liferay.portal.kernel.service.RoleLocalService;
import com.liferay.portal.kernel.service.ServiceContext;
import com.liferay.portal.kernel.service.UserLocalService;
import com.liferay.portal.kernel.util.Validator;
import dev.mordonez.ldev.oauth2.app.configuration.LdevOAuth2AppConfiguration;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Modified;
import org.osgi.service.component.annotations.Reference;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Gogo-invocable component that installs the OAuth2 applications used by ldev.
 *
 * When enabled via OSGi configuration, it can also provision the application
 * automatically during component activation.
 */
@Component(
    configurationPid = "dev.mordonez.ldev.oauth2.app.configuration.LdevOAuth2AppConfiguration",
    immediate = true,
    property = {
        "osgi.command.function=adminUnblock",
        "osgi.command.function=oauthInstall",
        "osgi.command.scope=ldev"
    },
    service = Object.class
)
public class LdevOAuth2AppCommand {

    @Activate
    @Modified
    protected void activate(Map<String, Object> properties) {
        _configuration = ConfigurableUtil.createConfigurable(LdevOAuth2AppConfiguration.class, properties);

        if (_log.isDebugEnabled()) {
            _log.debug("ldev OAuth2 app installer ready.");
        }

        if (_configuration.enabled()) {
            try {
                InstallResult installResult = installOAuth2Applications(
                    normalizeConfiguredLong(_configuration.companyId()),
                    normalizeConfiguredLong(_configuration.userId()),
                    null);

                if (_log.isInfoEnabled()) {
                    _log.info(
                        String.format(
                            "ldev OAuth2 app auto-installed for company %s (user %s, clientId=%s).",
                            installResult.company.getCompanyId(),
                            installResult.user.getUserId(),
                            installResult.readWriteApplication.getClientId()));
                }
            }
            catch (PortalException portalException) {
                _log.error("Unable to auto-install the ldev OAuth2 applications from OSGi configuration.", portalException);
            }
        }
    }

    public String oauthInstall() throws PortalException {
        return formatInstallResult(installOAuth2Applications(null, null, null));
    }

    public String oauthInstall(String scopeAliases) throws PortalException {
        return formatInstallResult(installOAuth2Applications(null, null, parseScopeAliases(scopeAliases)));
    }

    public String oauthInstall(long companyId) throws PortalException {
        return formatInstallResult(installOAuth2Applications(companyId, null, null));
    }

    public String oauthInstall(long companyId, String scopeAliases) throws PortalException {
        return formatInstallResult(installOAuth2Applications(companyId, null, parseScopeAliases(scopeAliases)));
    }

    public String oauthInstall(long companyId, long userId) throws PortalException {
        return formatInstallResult(installOAuth2Applications(companyId, userId, null));
    }

    public String oauthInstall(long companyId, long userId, String scopeAliases) throws PortalException {
        return formatInstallResult(installOAuth2Applications(companyId, userId, parseScopeAliases(scopeAliases)));
    }

    public String adminUnblock() throws PortalException {
        return formatAdminUnblockResult(unblockAdminUser(null, null));
    }

    public String adminUnblock(long companyId) throws PortalException {
        return formatAdminUnblockResult(unblockAdminUser(companyId, null));
    }

    public String adminUnblock(long companyId, long userId) throws PortalException {
        return formatAdminUnblockResult(unblockAdminUser(companyId, userId));
    }

    public synchronized InstallResult installOAuth2Applications(
        Long configuredCompanyId, Long configuredUserId, List<String> explicitScopeAliases) throws PortalException {
        Company company = resolveCompany(configuredCompanyId);
        User adminUser = resolveAdminUser(company, configuredUserId);

        String externalReferenceCode = resolveString(
            _configuration.externalReferenceCode(), "LIFERAY_CLI_OAUTH2_EXTERNAL_REFERENCE_CODE");
        String appName = resolveString(_configuration.appName(), "LIFERAY_CLI_OAUTH2_APP_NAME");
        List<String> allScopeAliases = explicitScopeAliases == null ? resolveScopeAliases() : explicitScopeAliases;

        OAuth2Application readWriteApplication = upsertOAuth2Application(
            company, adminUser,
            externalReferenceCode, appName,
            allScopeAliases, _configuration.clientId(), resolveClientSecret());

        List<String> readOnlyScopeAliases = resolveReadOnlyScopeAliases(allScopeAliases);

        OAuth2Application readOnlyApplication = upsertOAuth2Application(
            company, adminUser,
            externalReferenceCode + "-readonly", appName + "-readonly",
            readOnlyScopeAliases, "", "secret-" + UUID.randomUUID());

        return new InstallResult(company, adminUser, externalReferenceCode, readWriteApplication, readOnlyApplication);
    }

    public AdminUnblockResult unblockAdminUser(Long configuredCompanyId, Long configuredUserId) throws PortalException {
        Company company = resolveCompany(configuredCompanyId);
        User adminUser = resolveAdminUser(company, configuredUserId);

        _userLocalService.updatePasswordReset(adminUser.getUserId(), false);

        User refreshedUser = _userLocalService.getUser(adminUser.getUserId());

        _log.info(
            String.format(
                "Admin user %s (%s) unblocked for company %s.",
                refreshedUser.getUserId(), refreshedUser.getEmailAddress(), company.getCompanyId()));

        return new AdminUnblockResult(company, refreshedUser);
    }

    private Company resolveCompany(Long configuredCompanyId) throws PortalException {
        if (configuredCompanyId != null && configuredCompanyId.longValue() > 0) {
            Company company = _companyLocalService.fetchCompany(configuredCompanyId.longValue());

            if (company != null) {
                return company;
            }

            throw new PortalException("Company ID '" + configuredCompanyId + "' not found.");
        }

        List<Company> companies = _companyLocalService.getCompanies();

        if (!companies.isEmpty()) {
            return companies.get(0);
        }

        throw new PortalException("No companies are available in this Liferay instance.");
    }

    private User resolveAdminUser(Company company, Long configuredUserId) throws PortalException {
        if (configuredUserId != null && configuredUserId.longValue() > 0) {
            User user = _userLocalService.fetchUser(configuredUserId.longValue());

            if (user != null && user.getCompanyId() == company.getCompanyId()) {
                return user;
            }

            throw new PortalException(
                "User ID '" + configuredUserId + "' not found in company " + company.getCompanyId() + ".");
        }

        Role administratorRole = _roleLocalService.fetchRole(company.getCompanyId(), "Administrator");

        if (administratorRole != null) {
            List<User> administratorUsers = _userLocalService.getRoleUsers(administratorRole.getRoleId(), 0, 1);

            if (!administratorUsers.isEmpty()) {
                return administratorUsers.get(0);
            }
        }

        List<User> users = _userLocalService.getCompanyUsers(company.getCompanyId(), 0, 1);
        if (!users.isEmpty()) {
            return users.get(0);
        }

        throw new PortalException("No admin user found for company " + company.getCompanyId() + ".");
    }

    private OAuth2Application upsertOAuth2Application(
            Company company, User adminUser,
            String externalReferenceCode, String appName,
            List<String> scopeAliases, String configuredClientId, String newClientSecret)
        throws PortalException {

        boolean rotateSecret = _configuration.rotateClientSecret();
        String clientSecret = newClientSecret;

        OAuth2Application oAuth2Application = _oAuth2ApplicationLocalService.fetchOAuth2ApplicationByExternalReferenceCode(
            externalReferenceCode, company.getCompanyId());

        boolean existed = oAuth2Application != null;

        String clientId;
        if (existed) {
            // Always preserve the existing clientId to avoid desynchronising the portal DB
            // from the local credentials file. A configuredClientId is only honoured for
            // new app creation; changing the ID of an existing app would invalidate any
            // previously issued tokens and break callers that cached the old ID.
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

        PortalException lastPortalException = null;

        for (String clientAuthenticationMethod : resolveClientAuthenticationMethodCandidates()) {
            try {
                _oAuth2ApplicationLocalService.addOrUpdateOAuth2Application(
                    externalReferenceCode,
                    adminUser.getUserId(),
                    adminUser.getFullName(),
                    Collections.singletonList(GrantType.CLIENT_CREDENTIALS),
                    clientAuthenticationMethod,
                    adminUser.getUserId(),
                    clientId,
                    4,
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

                oAuth2Application = _oAuth2ApplicationLocalService.fetchOAuth2ApplicationByExternalReferenceCode(
                    externalReferenceCode, company.getCompanyId());

                _log.info(String.format(
                    "OAuth2 app '%s' %s (clientId=%s, authMethod=%s).",
                    appName, existed ? "updated" : "created", clientId, clientAuthenticationMethod));

                return oAuth2Application;
            } catch (PortalException portalException) {
                lastPortalException = portalException;

                if (!isUnsupportedClientAuthenticationMethod(portalException)) {
                    throw portalException;
                }
            }
        }

        throw new PortalException("Unable to resolve a supported client authentication method.", lastPortalException);
    }

    private List<String> resolveScopeAliases() {
        List<String> configuredScopeAliases = Optional.ofNullable(_configuration.scopeAliases())
            .map(aliases -> Arrays.stream(aliases)
                .filter(Validator::isNotNull)
                .map(String::trim)
                .filter(Validator::isNotNull)
                .collect(Collectors.toList()))
            .orElse(Collections.emptyList());

        return LdevOAuth2BootstrapSupport.resolveManagedScopeAliases(configuredScopeAliases);
    }

    private List<String> parseScopeAliases(String scopeAliases) {
        if (Validator.isNull(scopeAliases)) {
            return null;
        }

        List<String> configuredScopeAliases = Arrays.stream(scopeAliases.split(","))
            .filter(Validator::isNotNull)
            .map(String::trim)
            .filter(Validator::isNotNull)
            .collect(Collectors.toList());

        return LdevOAuth2BootstrapSupport.resolveManagedScopeAliases(configuredScopeAliases);
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

    private List<String> resolveClientAuthenticationMethodCandidates() {
        Set<String> candidates = new LinkedHashSet<String>();

        addCandidate(candidates, resolveString(
            _configuration.clientAuthenticationMethod(), "LIFERAY_CLI_OAUTH2_CLIENT_AUTHENTICATION_METHOD"));
        addCandidate(candidates, "client_secret_post");
        addCandidate(candidates, "client_secret_basic");
        addCandidate(candidates, "post");
        addCandidate(candidates, "basic");
        addCandidate(candidates, "none");

        return candidates.stream().collect(Collectors.toList());
    }

    private void addCandidate(Set<String> candidates, String candidate) {
        if (Validator.isNotNull(candidate)) {
            candidates.add(candidate.trim());
        }
    }

    private boolean isUnsupportedClientAuthenticationMethod(PortalException portalException) {
        String message = portalException.getMessage();

        return Validator.isNotNull(message) && message.contains("Unrecognized client authentication method");
    }

    private String resolveClientSecret() {
        String configValue = _configuration.clientSecret();
        if (Validator.isNotNull(configValue)) {
            return configValue.trim();
        }

        return "secret-" + UUID.randomUUID();
    }

    private Long normalizeConfiguredLong(long value) {
        if (value <= 0) {
            return null;
        }

        return value;
    }

    private String resolveString(String configValue, String envKey) {
        String envValue = System.getenv(envKey);
        return Validator.isNotNull(envValue) ? envValue.trim() : configValue;
    }

    private String formatInstallResult(InstallResult result) {
        StringBuilder sb = new StringBuilder();

        sb.append("companyId=").append(result.company.getCompanyId()).append('\n');
        sb.append("companyWebId=").append(result.company.getWebId()).append('\n');
        sb.append("userId=").append(result.user.getUserId()).append('\n');
        sb.append("userEmail=").append(result.user.getEmailAddress()).append('\n');
        sb.append("externalReferenceCode=").append(result.externalReferenceCode).append('\n');
        sb.append("LIFERAY_CLI_OAUTH2_CLIENT_ID=").append(result.readWriteApplication.getClientId()).append('\n');
        sb.append("LIFERAY_CLI_OAUTH2_CLIENT_SECRET=").append(result.readWriteApplication.getClientSecret());

        if (result.readOnlyApplication != null) {
            sb.append('\n');
            sb.append("LIFERAY_CLI_OAUTH2_READONLY_CLIENT_ID=").append(result.readOnlyApplication.getClientId()).append('\n');
            sb.append("LIFERAY_CLI_OAUTH2_READONLY_CLIENT_SECRET=").append(result.readOnlyApplication.getClientSecret());
        }

        return sb.toString();
    }

    private String formatAdminUnblockResult(AdminUnblockResult result) {
        StringBuilder sb = new StringBuilder();

        sb.append("companyId=").append(result.company.getCompanyId()).append('\n');
        sb.append("companyWebId=").append(result.company.getWebId()).append('\n');
        sb.append("userId=").append(result.user.getUserId()).append('\n');
        sb.append("userEmail=").append(result.user.getEmailAddress()).append('\n');
        sb.append("passwordReset=").append(result.user.isPasswordReset());

        return sb.toString();
    }

    public static class AdminUnblockResult {

        private AdminUnblockResult(Company company, User user) {
            this.company = company;
            this.user = user;
        }

        private final Company company;
        private final User user;
    }

    public static class InstallResult {

        private InstallResult(
            Company company, User user, String externalReferenceCode,
            OAuth2Application readWriteApplication, OAuth2Application readOnlyApplication) {

            this.company = company;
            this.user = user;
            this.externalReferenceCode = externalReferenceCode;
            this.readWriteApplication = readWriteApplication;
            this.readOnlyApplication = readOnlyApplication;
        }

        private final Company company;
        private final String externalReferenceCode;
        private final OAuth2Application readOnlyApplication;
        private final OAuth2Application readWriteApplication;
        private final User user;
    }

    private static final Log _log = LogFactoryUtil.getLog(LdevOAuth2AppCommand.class);

    private volatile LdevOAuth2AppConfiguration _configuration;

    @Reference
    private CompanyLocalService _companyLocalService;

    @Reference(target = ModuleServiceLifecycle.PORTAL_INITIALIZED, unbind = "-")
    private ModuleServiceLifecycle _moduleServiceLifecycle;

    @Reference
    private OAuth2ApplicationLocalService _oAuth2ApplicationLocalService;

    @Reference
    private RoleLocalService _roleLocalService;

    @Reference
    private UserLocalService _userLocalService;
}
