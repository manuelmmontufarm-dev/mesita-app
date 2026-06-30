import { describe, it, expect } from "vitest";
import { redact, hashForLog } from "../log";

type AnyObj = Record<string, unknown>;

describe("redact", () => {
  it("redacts sensitive fields", () => {
    const obj = {
      email: "test@example.com",
      password: "secret123",
      token: "abc123def456",
      name: "John",
    };
    const result = redact(obj);
    expect((result as AnyObj).email).toBe("[redacted]");
    expect((result as AnyObj).password).toBe("[redacted]");
    expect((result as AnyObj).token).toBe("[redacted]");
    expect((result as AnyObj).name).toBe("John");
  });

  it("leaves non-sensitive fields untouched", () => {
    const obj = {
      id: "123",
      name: "John Doe",
      amount: 100,
      status: "completed",
    };
    const result = redact(obj);
    expect(result).toEqual(obj);
  });

  it("recursively redacts nested objects", () => {
    const obj = {
      user: {
        email: "test@example.com",
        name: "John",
        password: "secret123",
      },
      data: {
        paymentToken: "pt123",
        value: "safe",
      },
    };
    const result = redact(obj);
    expect(((result as AnyObj).user as AnyObj).email).toBe("[redacted]");
    expect(((result as AnyObj).user as AnyObj).password).toBe("[redacted]");
    expect(((result as AnyObj).user as AnyObj).name).toBe("John");
    expect(((result as AnyObj).data as AnyObj).paymentToken).toBe("[redacted]");
    expect(((result as AnyObj).data as AnyObj).value).toBe("safe");
  });

  it("handles null and undefined values", () => {
    const obj = {
      email: "test@example.com",
      nullField: null,
      undefinedField: undefined,
      name: "John",
    };
    const result = redact(obj);
    expect((result as AnyObj).email).toBe("[redacted]");
    expect((result as AnyObj).nullField).toBeNull();
    expect((result as AnyObj).undefinedField).toBeUndefined();
    expect((result as AnyObj).name).toBe("John");
  });

  it("handles primitive values", () => {
    expect(redact("string")).toBe("string");
    expect(redact(123)).toBe(123);
    expect(redact(true)).toBe(true);
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it("handles deeply nested objects", () => {
    const obj = {
      level1: {
        level2: {
          email: "test@example.com",
          safe: "value",
        },
      },
    };
    const result = redact(obj);
    expect((((result as AnyObj).level1 as AnyObj).level2 as AnyObj).email).toBe("[redacted]");
    expect((((result as AnyObj).level1 as AnyObj).level2 as AnyObj).safe).toBe("value");
  });

  it("redacts all sensitive field variants", () => {
    const obj = {
      email: "user@test.com",
      password: "pass",
      token: "tok",
      ticketNumber: "123",
      paymentToken: "pt",
      providerTransactionId: "pti",
      posDocumentId: "pdi",
      apiKey: "ak",
      secret: "sec",
      sessionToken: "st",
      identificacion: "id",
      cardNumber: "4111111111111111",
      normalField: "safe",
    };
    const result = redact(obj) as AnyObj;
    Object.keys(obj).forEach((key) => {
      if (key === "normalField") {
        expect(result[key]).toBe("safe");
      } else {
        expect(result[key]).toBe("[redacted]");
      }
    });
  });
});

describe("hashForLog", () => {
  it("returns 8-character hex string", () => {
    const hash = hashForLog("test value");
    expect(hash).toMatch(/^[a-f0-9]{8}$/);
    expect(hash.length).toBe(8);
  });

  it("is deterministic for same input", () => {
    const input = "fixed value";
    const hash1 = hashForLog(input);
    const hash2 = hashForLog(input);
    expect(hash1).toBe(hash2);
  });

  it("produces different output for different inputs", () => {
    const hash1 = hashForLog("value1");
    const hash2 = hashForLog("value2");
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty string", () => {
    const hash = hashForLog("");
    expect(hash).toMatch(/^[a-f0-9]{8}$/);
  });

  it("handles long strings", () => {
    const longString = "x".repeat(10000);
    const hash = hashForLog(longString);
    expect(hash).toMatch(/^[a-f0-9]{8}$/);
  });

  it("handles special characters", () => {
    const inputs = [
      "user@example.com",
      "password!@#$%",
      "token-with-dashes",
      "uuid-like-00000000-0000-0000-0000-000000000000",
    ];
    inputs.forEach((input) => {
      const hash = hashForLog(input);
      expect(hash).toMatch(/^[a-f0-9]{8}$/);
    });
  });
});
