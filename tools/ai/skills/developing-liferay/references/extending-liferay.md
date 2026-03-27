# Extending Liferay Reference

Use this reference when you need to customize core behavior and must choose the safest extension point.

## Table of contents

- [1) Wait for lifecycle events](#1-wait-for-lifecycle-events)
- [2) Model listeners](#2-model-listeners)
- [3) Service wrappers](#3-service-wrappers)
- [4) Dynamic includes](#4-dynamic-includes)
- [5) Localization customization](#5-localization-customization)
- [6) OSGi service overrides](#6-osgi-service-overrides)
- [7) JSP overrides (fragment/hook)](#7-jsp-overrides-fragmenthook)
- [8) Portlet filters](#8-portlet-filters)
- [9) Servlet filters](#9-servlet-filters)
- [Official docs reviewed](#official-docs-reviewed)

## 1) Wait for lifecycle events

Use this when startup code depends on a portal lifecycle milestone.

```java
@Component(immediate = true, service = {})
public class StartupComponent {

    @Activate
    protected void activate() {
        // Run only after the referenced lifecycle milestone is available.
    }

    @Reference(target = ModuleServiceLifecycle.PORTAL_INITIALIZED, unbind = "-")
    private ModuleServiceLifecycle _moduleServiceLifecycle;
}
```

Notes:
- Prefer lifecycle gating over sleep/retry loops.
- Keep startup logic idempotent.

## 2) Model listeners

Use this to react to model create/update/remove events.

```java
@Component(immediate = true, service = ModelListener.class)
public class UserModelListener extends BaseModelListener<User> {
    @Override
    public void onAfterCreate(User user) throws ModelListenerException {
        // Add side effects here.
    }
}
```

Notes:
- Keep listener code fast.
- Move heavy I/O to async/background processing.

## 3) Service wrappers

Use this to extend existing LocalService/Service behavior without replacing the full implementation.

```java
@Component(service = ServiceWrapper.class)
public class CustomUserLocalServiceWrapper extends UserLocalServiceWrapper {
    @Override
    public User addUser(...) throws PortalException {
        // Pre logic
        User user = super.addUser(...);
        // Post logic
        return user;
    }
}
```

Notes:
- Prefer wrappers before full OSGi service replacement.
- Keep wrappers narrow and deterministic.

## 4) Dynamic includes

Use this to inject markup/script at a known JSP include point without copying the whole JSP.

```java
@Component(service = DynamicInclude.class)
public class LoginDynamicInclude implements DynamicInclude {
    @Override
    public void register(DynamicIncludeRegistry registry) {
        registry.register("com.liferay.login.web#/login.jsp#post");
    }
}
```

Notes:
- Include keys are module specific; verify keys from source before implementation.
- Use dynamic includes for additive UI changes.

## 5) Localization customization

Use this when overriding translation keys, adding languages, or automating translation generation.

Notes:
- Keep custom keys in dedicated language modules.
- For module-level overrides, use fully qualified module keys in `Language_xx_XX.properties`.
- From DXP 2025.Q2+, module override behavior changed for short keys; review resource action based overrides when needed.
- Avoid hardcoded UI text in Java/JSP/FTL.

## 6) OSGi service overrides

Use this only when wrapper/listener/filter/include patterns cannot solve the requirement.

```java
@Component(
    property = "service.ranking:Integer=100",
    service = SomeService.class
)
public class CustomSomeService implements SomeService {
}
```

Notes:
- Higher `service.ranking` wins.
- Keep target filters strict so you do not replace unintended services.

## 7) JSP overrides (fragment/hook)

Use this as a last resort for full JSP or static resource replacement.

Notes:
- Use OSGi fragments for resource replacement in target bundles.
- Copy only the files you actually modify.
- Revalidate fragment compatibility after DXP upgrades.

## 8) Portlet filters

Use this to intercept render/action/resource/event phases for specific portlets.

```java
@Component(
    property = {
        "javax.portlet.name=com_liferay_login_web_portlet_LoginPortlet",
        "javax.portlet.filter-render=true"
    },
    service = PortletFilter.class
)
public class CustomRenderFilter implements RenderFilter {
}
```

Notes:
- Choose the exact filter interface (`ActionFilter`, `RenderFilter`, etc.) for the lifecycle phase.
- Keep chain behavior intact (`chain.doFilter(...)`).

## 9) Servlet filters

Use this to intercept HTTP requests globally or by URL pattern.

```java
@Component(
    property = {
        "servlet-context-name=",
        "url-pattern=/c/*"
    },
    service = Filter.class
)
public class CustomServletFilter extends BaseFilter {
}
```

Notes:
- Scope URL patterns tightly.
- Use ordering properties carefully to avoid conflicts with core filters.

## Official docs reviewed

- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/waiting-for-lifecycle-events
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/creating-a-model-listener
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/creating-service-wrappers
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/customizing-jsps-with-dynamic-includes
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/customizing-localization
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/customizing-localization/adding-a-language
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/customizing-localization/overriding-global-language-translations-with-language-properties
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/customizing-localization/overriding-module-language-translations
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/customizing-localization/generating-translations-automatically
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/overriding-osgi-services
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/overriding-jsps
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/using-portlet-filters
- https://learn.liferay.com/w/dxp/development/traditional-java-based-development/extending-liferay/using-servlet-filters
