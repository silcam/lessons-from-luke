/// <reference types="jest" />

// This test verifies that HTTP API contracts (APIGet, APIPost, GetRoute, PostRoute)
// and invitation DTOs (InvitationResult, InvitationSummaryRow) live in a dedicated
// API contracts module, NOT in src/core/interfaces/Api.ts.
//
// src/core/interfaces/Api.ts should only contain pure domain types and utilities.

import type { APIGet, APIPost, GetRoute, PostRoute } from "../../../core/api/ApiContracts";
import type { InvitationResult, InvitationSummaryRow } from "../../../core/api/ApiContracts";

test("GetRoute is a string subtype (keyof APIGet)", () => {
  const route: GetRoute = "/api/languages";
  expect(typeof route).toBe("string");
});

test("PostRoute is a string subtype (keyof APIPost)", () => {
  const route: PostRoute = "/api/tStrings";
  expect(typeof route).toBe("string");
});

test("InvitationResult has expected shape", () => {
  const result: InvitationResult = {
    id: "abc",
    email: "user@example.com",
    role: "admin",
    status: "pending",
    link: "https://example.com/invite/abc",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
  expect(result.id).toBe("abc");
  expect(result.email).toBe("user@example.com");
});

test("InvitationSummaryRow has expected shape", () => {
  const row: InvitationSummaryRow = {
    id: "xyz",
    email: "user@example.com",
    role: "user",
    status: "accepted",
    createdAt: "2024-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    acceptedAt: null,
    invitedByEmail: "admin@example.com",
  };
  expect(row.id).toBe("xyz");
  expect(row.acceptedAt).toBeNull();
});

test("src/core/interfaces/Api does NOT export HTTP route maps or invitation DTOs", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const coreApi = require("../../../core/interfaces/Api");
  expect(coreApi).not.toHaveProperty("APIGet");
  expect(coreApi).not.toHaveProperty("APIPost");
  expect(coreApi).not.toHaveProperty("InvitationResult");
  expect(coreApi).not.toHaveProperty("InvitationSummaryRow");
  // Utility functions and domain types should still be present
  expect(coreApi).toHaveProperty("encodeLanguageTimestamps");
  expect(coreApi).toHaveProperty("decodeLanguageTimestamps");
});
