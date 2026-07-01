/**
 * MemoryEmailTransport unit tests.
 *
 * Spec: specs/005-transactional-email-reset/data-model.md §EmailTransport (MemoryEmailTransport row)
 * Contract: specs/005-transactional-email-reset/contracts/email-transport.contract.ts §SentEmail
 */

import { MemoryEmailTransport, sentEmails } from "./MemoryEmailTransport";
import { resetEmailTransport } from "./getEmailTransport";
import { EmailMessage } from "./EmailTransport";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const validMessage: EmailMessage = {
  to: "recipient@example.com",
  subject: "Test subject",
  text: "Hello from the test suite. Link: https://app.example.com/reset?token=testtoken",
  html: "<p>Hello!</p>",
};

// ---------------------------------------------------------------------------
// Cleanup: reset the in-process buffer between tests
// ---------------------------------------------------------------------------

afterEach(() => {
  // Mirrors the reset jestSetupAfterEnv.ts performs for the shared email transport
  resetEmailTransport();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MemoryEmailTransport", () => {
  // -------------------------------------------------------------------------
  // 1. send() appends to the sentEmails array
  // -------------------------------------------------------------------------

  it("send() appends the sent message to the sentEmails array", async () => {
    const transport = new MemoryEmailTransport();

    expect(sentEmails).toHaveLength(0);

    await transport.send(validMessage);

    // The sentEmails array must have grown by one
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({
      to: validMessage.to,
      subject: validMessage.subject,
      text: validMessage.text,
      html: validMessage.html,
    });
  });

  it("send() appends multiple messages in order", async () => {
    const transport = new MemoryEmailTransport();

    const message1: EmailMessage = {
      to: "first@example.com",
      subject: "First",
      text: "First email body",
    };
    const message2: EmailMessage = {
      to: "second@example.com",
      subject: "Second",
      text: "Second email body",
    };

    await transport.send(message1);
    await transport.send(message2);

    expect(sentEmails).toHaveLength(2);
    expect(sentEmails[0].to).toBe("first@example.com");
    expect(sentEmails[1].to).toBe("second@example.com");
  });

  it("send() captures html as undefined when not provided", async () => {
    const transport = new MemoryEmailTransport();
    const textOnlyMessage: EmailMessage = {
      to: "user@example.com",
      subject: "Text only",
      text: "No HTML here",
    };

    await transport.send(textOnlyMessage);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].html).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 2. resetEmailTransport() clears the sentEmails buffer
  // -------------------------------------------------------------------------

  it("resetEmailTransport() clears the sentEmails array", async () => {
    const transport = new MemoryEmailTransport();

    await transport.send(validMessage);
    expect(sentEmails).toHaveLength(1);

    // resetEmailTransport() must clear the sentEmails buffer
    resetEmailTransport();

    expect(sentEmails).toHaveLength(0);
  });

  it("sentEmails is empty at the start of each test (cleared by afterEach resetEmailTransport)", () => {
    // This test verifies the test-isolation guarantee: the afterEach above
    // (and jestSetupAfterEnv once GREEN ships) must leave sentEmails empty
    // so no cross-test contamination occurs.
    expect(sentEmails).toHaveLength(0);
  });
});
