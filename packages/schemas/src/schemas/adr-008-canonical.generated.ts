// GENERATED FILE — DO NOT EDIT.
// Source: docs/standards/decisions/data/adr-008-core-exception-register{,.schema}.json
// Regenerate with: pnpm --filter @comity-dev/schemas generate

import type { Adr008Register } from "./adr-008-register.js";

export const adr008RegisterSchemaDocument: Record<string, unknown> = {
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "comity:adr-008-core-exception-register.schema.json",
  "title": "ADR-008 Core-to-Core Dependency Exception Register",
  "description": "Machine-readable serialization of the ADR-008 closed register of Core-to-Core dependency exceptions. ADR-008 (Markdown) remains the architectural authority; this register is a derived representation and MUST NOT redefine architecture.",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "$schema",
    "schemaVersion",
    "authority",
    "source",
    "edges"
  ],
  "properties": {
    "$schema": {
      "const": "comity:adr-008-core-exception-register.schema.json"
    },
    "schemaVersion": {
      "type": "integer",
      "const": 1,
      "description": "Version of the register schema. Incremented when the data contract changes in a breaking way."
    },
    "authority": {
      "const": "ADR-008",
      "description": "The architectural authority this register serializes."
    },
    "source": {
      "const": "../ADR-008-explicit-core-module-composition-exceptions.md",
      "description": "Path to the authoritative ADR document, relative to the register file (the ADR lives in the parent directory of data/)."
    },
    "edges": {
      "type": "array",
      "description": "Closed list of approved Core-to-Core dependency exceptions.",
      "items": {
        "$ref": "#/$defs/dependencyEdge"
      },
      "uniqueItems": true
    }
  },
  "$defs": {
    "dependencyEdge": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "from",
        "to",
        "layer",
        "categories",
        "importKind",
        "lifecycle",
        "justification",
        "adrReference"
      ],
      "properties": {
        "from": {
          "type": "string",
          "pattern": "^@comity/[a-z0-9-]+$",
          "description": "Source package name."
        },
        "to": {
          "type": "string",
          "pattern": "^@comity/[a-z0-9-]+$",
          "description": "Target package name."
        },
        "layer": {
          "const": "core-to-core",
          "description": "Layer relationship. This register covers only Core-to-Core edges."
        },
        "categories": {
          "type": "array",
          "minItems": 1,
          "uniqueItems": true,
          "items": {
            "type": "string",
            "enum": [
              "capability",
              "infrastructure-contract",
              "value-import",
              "candidate-for-removal"
            ]
          },
          "description": "All classifications that apply to this edge. A single edge may belong to multiple classifications (e.g., storefront -> catalog is both a capability exception and a value-import exception). This is the sole classification field."
        },
        "importKind": {
          "type": "string",
          "enum": [
            "type-only",
            "value",
            "mixed"
          ],
          "description": "Whether the dependency is type-only, value, or a mix of both."
        },
        "lifecycle": {
          "type": "string",
          "enum": [
            "approved",
            "deprecated",
            "migration-candidate"
          ],
          "description": "Lifecycle status: approved exception, deprecated pattern tracked for removal, or scheduled migration candidate."
        },
        "justification": {
          "type": "string",
          "minLength": 1,
          "description": "Justification as recorded in ADR-008."
        },
        "adrReference": {
          "type": "string",
          "minLength": 1,
          "description": "Reference back to ADR-008, including the specific register section/table where practical."
        },
        "removalCandidate": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "criteria",
            "action"
          ],
          "description": "Removal candidate tracking, mirroring ADR-008 'Candidates for Removal'. Required when lifecycle is 'migration-candidate'.",
          "properties": {
            "criteria": {
              "type": "string",
              "description": "The ADR-008 acceptance criteria this dependency fails."
            },
            "action": {
              "type": "string",
              "description": "The migration action required to remove or refactor the dependency."
            }
          }
        }
      },
      "if": {
        "properties": {
          "lifecycle": {
            "const": "migration-candidate"
          }
        },
        "required": [
          "lifecycle"
        ]
      },
      "then": {
        "required": [
          "removalCandidate"
        ]
      }
    }
  }
};

export const adr008CanonicalRegister: Adr008Register = {
  "$schema": "comity:adr-008-core-exception-register.schema.json",
  "schemaVersion": 1,
  "authority": "ADR-008",
  "source": "../ADR-008-explicit-core-module-composition-exceptions.md",
  "edges": [
    {
      "from": "@comity/storefront",
      "to": "@comity/catalog",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Storefront page composition references catalog domain contracts and models.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/storefront",
      "to": "@comity/taxonomy",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Storefront category page composition references taxonomy domain contracts and models.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/storefront",
      "to": "@comity/content",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Storefront content page composer references content domain models.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/storefront",
      "to": "@comity/search",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Storefront search page contract references SearchResultModel.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/catalog",
      "to": "@comity/media",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Catalog projections reference MediaModel for product/brand media.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/content",
      "to": "@comity/media",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Content blocks/pages reference MediaModel.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/content",
      "to": "@comity/seo",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Content pages reference SeoModel.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/taxonomy",
      "to": "@comity/media",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Taxonomy models reference MediaModel for category image.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/order",
      "to": "@comity/pricing",
      "layer": "core-to-core",
      "categories": [
        "capability",
        "value-import"
      ],
      "importKind": "value",
      "lifecycle": "approved",
      "justification": "@comity/order composes its order-level PriceRecord via the public PriceRecord type and combine (record composition, not calculation); the record type stays pricing-owned.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/order",
      "to": "@comity/organization",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Order contracts reference ChannelId for commercial channel scoping.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/fulfillment",
      "to": "@comity/order",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Fulfillment references the committed order by OrderId and reuses the OrderAddressSnapshot contract for shipping recipients; it never holds an Order and imports no value from @comity/order.",
      "adrReference": "ADR-008 — Amendment 2, Capability Exceptions"
    },
    {
      "from": "@comity/fulfillment",
      "to": "@comity/organization",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Fulfillment repository contracts require TenantId for multi-tenant isolation, as order and customer repositories do.",
      "adrReference": "ADR-008 — Amendment 2, Capability Exceptions"
    },
    {
      "from": "@comity/entitlement",
      "to": "@comity/organization",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Entitlement repository contexts require the nominal TenantId for multi-tenant isolation, as order, customer and fulfillment repositories do.",
      "adrReference": "ADR-008 — Amendment 3, Capability Exceptions"
    },
    {
      "from": "@comity/customer",
      "to": "@comity/validation",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Customer validator consumes the shared Validator contract.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/customer",
      "to": "@comity/organization",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Customer repository requires TenantId for multi-tenant isolation.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/address",
      "to": "@comity/validation",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Address validator consumes the shared Validator contract.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/identity",
      "to": "@comity/validation",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Identity validator consumes the shared Validator contract.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    },
    {
      "from": "@comity/auth-tokens",
      "to": "@comity/auth",
      "layer": "core-to-core",
      "categories": [
        "value-import"
      ],
      "importKind": "mixed",
      "lifecycle": "approved",
      "justification": "Token facade error surface normalizes AuthError at runtime. @comity/auth owns authentication error semantics; direction is intentional and non-cyclic.",
      "adrReference": "ADR-008 — Dependency Register, Value-Import Exceptions"
    },
    {
      "from": "@comity/router",
      "to": "@comity/http",
      "layer": "core-to-core",
      "categories": [
        "infrastructure-contract"
      ],
      "importKind": "type-only",
      "lifecycle": "deprecated",
      "justification": "Router contracts reference HttpContext, HttpHandler, HttpMethod. Compatibility exception; extraction candidate.",
      "adrReference": "ADR-008 — Dependency Register, Infrastructure Contract Exceptions"
    },
    {
      "from": "@comity/payment",
      "to": "@comity/pricing",
      "layer": "core-to-core",
      "categories": [
        "capability"
      ],
      "importKind": "type-only",
      "lifecycle": "approved",
      "justification": "Payment module uses Money value object from pricing for amount representation in PaymentRequest and PaymentOutcome.",
      "adrReference": "ADR-008 — Dependency Register, Capability Exceptions"
    }
  ]
};
