import type { Adr008Register } from "./adr-008-register.js";

/**
 * Canonical ADR-008 Core Exception Register.
 *
 * This is the authoritative machine-readable representation of the
 * ADR-008 closed register of Core-to-Core dependency exceptions.
 *
 * @see ADR-008 — Explicit Core Module Composition Exceptions
 * @see ADR-009 — Machine-Readable Core Exception Register
 */
export const adr008CoreExceptionRegister: Adr008Register = {
  version: "1",
  edges: [
    {
      from: "@comity/storefront",
      to: "@comity/catalog",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification:
        "Storefront page composition references catalog domain contracts and models.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/storefront",
      to: "@comity/taxonomy",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification:
        "Storefront category page composition references taxonomy domain contracts and models.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/storefront",
      to: "@comity/content",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification:
        "Storefront content page composer references content domain models.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/storefront",
      to: "@comity/search",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification:
        "Storefront search page contract references SearchResultModel.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/catalog",
      to: "@comity/media",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification:
        "Catalog projections reference MediaModel for product/brand media.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/content",
      to: "@comity/media",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification: "Content blocks/pages reference MediaModel.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/content",
      to: "@comity/seo",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification: "Content pages reference SeoModel.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/taxonomy",
      to: "@comity/media",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification: "Taxonomy models reference MediaModel for category image.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/order",
      to: "@comity/pricing",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification: "Order items reference Price / PriceModifier.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/order",
      to: "@comity/organization",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification:
        "Order contracts reference ChannelId for commercial channel scoping.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/customer",
      to: "@comity/validation",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification:
        "Customer validator consumes the shared Validator contract.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/customer",
      to: "@comity/organization",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification:
        "Customer repository requires TenantId for multi-tenant isolation.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/address",
      to: "@comity/validation",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification:
        "Address validator consumes the shared Validator contract.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/identity",
      to: "@comity/validation",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification:
        "Identity validator consumes the shared Validator contract.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
    {
      from: "@comity/auth-tokens",
      to: "@comity/auth",
      layer: "core-to-core",
      categories: ["value-import"],
      importKind: "mixed",
      lifecycle: "approved",
      justification:
        "Token facade error surface normalizes AuthError at runtime. @comity/auth owns authentication error semantics; direction is intentional and non-cyclic.",
      adrReference: "ADR-008 — Dependency Register, Value-Import Exceptions",
    },
    {
      from: "@comity/router",
      to: "@comity/http",
      layer: "core-to-core",
      categories: ["infrastructure-contract"],
      importKind: "type-only",
      lifecycle: "deprecated",
      justification:
        "Router contracts reference HttpContext, HttpHandler, HttpMethod. Compatibility exception; extraction candidate.",
      adrReference:
        "ADR-008 — Dependency Register, Infrastructure Contract Exceptions",
    },
    {
      from: "@comity/payment",
      to: "@comity/pricing",
      layer: "core-to-core",
      categories: ["capability"],
      importKind: "type-only",
      lifecycle: "approved",
      justification:
        "Payment module uses Money value object from pricing for amount representation in PaymentRequest and PaymentOutcome.",
      adrReference: "ADR-008 — Dependency Register, Capability Exceptions",
    },
  ],
};
