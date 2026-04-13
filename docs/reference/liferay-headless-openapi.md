# Liferay Headless OpenAPI Catalog

Use this reference when extending `ldev` with Liferay headless REST calls.
Resolve the runtime base URL from `ldev context --json` (`env.portalUrl` or
`liferay.url`) and append the OpenAPI path.

The local examples from the labweb runtime use `http://127.0.0.1:8080`, but code
should not hardcode that host or port.

## Core discovery specs

- Headless Delivery: `/o/headless-delivery/v1.0/openapi.json`
- Headless Admin Site: `/o/headless-admin-site/v1.0/openapi.json`
- Data Engine: `/o/data-engine/v2.0/openapi.json`
- Headless Admin Content: `/o/headless-admin-content/v1.0/openapi.json`
- Object Admin: `/o/object-admin/v1.0/openapi.json`
- Search: `/o/search/v1.0/openapi.json`

## Full endpoint list

```text
/o/analytics-reports-rest/v1.0/openapi.json
/o/analytics-settings-rest/v1.0/openapi.json
/o/batch-planner/v1.0/openapi.json
/o/bulk/v1.0/openapi.json
/o/captcha/v1.0/openapi.json
/o/change-tracking-rest/v1.0/openapi.json
/o/data-engine/v2.0/openapi.json
/o/digital-signature-rest/v1.0/openapi.json
/o/dispatch-rest/v1.0/openapi.json
/o/functional-cookies-entries/openapi.json
/o/headless-admin-address/v1.0/openapi.json
/o/headless-admin-content/v1.0/openapi.json
/o/headless-admin-list-type/v1.0/openapi.json
/o/headless-admin-site/v1.0/openapi.json
/o/headless-admin-taxonomy/v1.0/openapi.json
/o/headless-admin-user/v1.0/openapi.json
/o/headless-admin-workflow/v1.0/openapi.json
/o/headless-batch-engine/v1.0/openapi.json
/o/headless-commerce-admin-account/v1.0/openapi.json
/o/headless-commerce-admin-catalog/v1.0/openapi.json
/o/headless-commerce-admin-channel/v1.0/openapi.json
/o/headless-commerce-admin-inventory/v1.0/openapi.json
/o/headless-commerce-admin-order/v1.0/openapi.json
/o/headless-commerce-admin-payment/v1.0/openapi.json
/o/headless-commerce-admin-pricing/v1.0/openapi.json
/o/headless-commerce-admin-pricing/v2.0/openapi.json
/o/headless-commerce-admin-shipment/v1.0/openapi.json
/o/headless-commerce-admin-site-setting/v1.0/openapi.json
/o/headless-commerce-delivery-cart/v1.0/openapi.json
/o/headless-commerce-delivery-catalog/v1.0/openapi.json
/o/headless-commerce-delivery-order/v1.0/openapi.json
/o/headless-commerce-machine-learning/v1.0/openapi.json
/o/headless-delivery/v1.0/openapi.json
/o/headless-form/v1.0/openapi.json
/o/headless-portal-instances/v1.0/openapi.json
/o/headless-site/v1.0/openapi.json
/o/headless-user-notification/v1.0/openapi.json
/o/language/v1.0/openapi.json
/o/necessary-cookies-entries/openapi.json
/o/notification/v1.0/openapi.json
/o/object-admin/v1.0/openapi.json
/o/performance-cookies-entries/openapi.json
/o/personalization-cookies-entries/openapi.json
/o/portal-workflow-metrics/v1.0/openapi.json
/o/saml-admin/v1.0/openapi.json
/o/scim/v1.0/openapi.json
/o/search/v1.0/openapi.json
/o/search-experiences-rest/v1.0/openapi.json
/o/segments-asah/v1.0/openapi.json
```
