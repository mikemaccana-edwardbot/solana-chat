import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  bytesToBase58,
  base58ToBytes,
  bytesToHex,
  hexToBytes,
  base58ToHexLocalpart,
  hexLocalpartToBase58,
  borshEncodeString,
  borshDecodeString,
  walletToMatrixUserId,
} from "../src/encoding";

describe("base58 encoding", () => {
  test("encodes a known Solana address", () => {
    // All-ones byte array should produce a known base58 string
    const bytes = new Uint8Array(32).fill(1);
    const encoded = bytesToBase58(bytes);
    // Decode it back and verify roundtrip
    const decoded = base58ToBytes(encoded);
    assert.deepStrictEqual(decoded, bytes);
  });

  test("handles leading zero bytes", () => {
    const bytes = new Uint8Array(32);
    bytes[0] = 0;
    bytes[1] = 0;
    bytes[31] = 1;
    const encoded = bytesToBase58(bytes);
    // Leading zeros become '1' in base58
    assert.ok(encoded.startsWith("11"), `Expected leading '11', got: ${encoded}`);
    const decoded = base58ToBytes(encoded);
    assert.deepStrictEqual(decoded, bytes);
  });

  test("roundtrips a realistic Solana address", () => {
    // Simulate a random 32-byte key
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = (i * 37 + 13) % 256;
    }
    const encoded = bytesToBase58(bytes);
    const decoded = base58ToBytes(encoded);
    assert.deepStrictEqual(decoded, bytes);
  });

  test("rejects invalid base58 characters", () => {
    assert.throws(() => base58ToBytes("0OIl"), /Invalid base58 character/);
  });
});

describe("hex encoding", () => {
  test("encodes bytes to lowercase hex", () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    assert.equal(bytesToHex(bytes), "00010f10ff");
  });

  test("decodes hex to bytes", () => {
    const hex = "00010f10ff";
    const expected = new Uint8Array([0, 1, 15, 16, 255]);
    assert.deepStrictEqual(hexToBytes(hex), expected);
  });

  test("roundtrips 32-byte key", () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = i * 8;
    }
    assert.deepStrictEqual(hexToBytes(bytesToHex(bytes)), bytes);
  });

  test("hex output is always lowercase", () => {
    const bytes = new Uint8Array([171, 205, 239]); // 0xAB, 0xCD, 0xEF
    assert.equal(bytesToHex(bytes), "abcdef");
  });
});

describe("base58 ↔ hex localpart conversion", () => {
  test("converts base58 address to prefixed 71-char hex localpart", () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = i;
    }
    const base58 = bytesToBase58(bytes);
    const hex = base58ToHexLocalpart(base58);
    assert.equal(hex.length, 71, "Hex localpart must be 'solana_' (7) + 64 hex chars = 71");
    assert.ok(hex.startsWith("solana_"), "Must start with solana_ prefix");
    assert.match(hex.slice(7), /^[0-9a-f]+$/, "Hex portion must be lowercase hex only");
  });

  test("roundtrips base58 → hex → base58", () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = (i * 17 + 5) % 256;
    }
    const original = bytesToBase58(bytes);
    const hex = base58ToHexLocalpart(original);
    const recovered = hexLocalpartToBase58(hex);
    assert.equal(recovered, original);
  });

  test("hex localpart is valid for Matrix (lowercase, underscores allowed)", () => {
    const bytes = new Uint8Array(32).fill(255);
    const hex = base58ToHexLocalpart(bytesToBase58(bytes));
    // Matrix localparts allow: a-z, 0-9, ., _, =, -, /
    assert.match(hex, /^[a-z0-9_]+$/);
  });

  test("different keys produce different localparts (no collisions)", () => {
    const key1 = new Uint8Array(32).fill(1);
    const key2 = new Uint8Array(32).fill(2);
    const hex1 = base58ToHexLocalpart(bytesToBase58(key1));
    const hex2 = base58ToHexLocalpart(bytesToBase58(key2));
    assert.notEqual(hex1, hex2);
  });
});

describe("borsh string encoding", () => {
  test("encodes a string with 4-byte LE length prefix", () => {
    const encoded = borshEncodeString("hello");
    // 4 bytes length + 5 bytes "hello"
    assert.equal(encoded.length, 9);
    // Length prefix should be 5 in little-endian
    assert.equal(encoded[0], 5);
    assert.equal(encoded[1], 0);
    assert.equal(encoded[2], 0);
    assert.equal(encoded[3], 0);
    // The string bytes
    assert.equal(encoded[4], "h".charCodeAt(0));
  });

  test("encodes an empty string", () => {
    const encoded = borshEncodeString("");
    assert.equal(encoded.length, 4);
    assert.deepStrictEqual(encoded, new Uint8Array([0, 0, 0, 0]));
  });

  test("encodes Unicode correctly", () => {
    const encoded = borshEncodeString("café");
    const [decoded] = borshDecodeString(encoded, 0);
    assert.equal(decoded, "café");
  });

  test("roundtrips encode/decode", () => {
    const original = "chat.solana.example.com";
    const encoded = borshEncodeString(original);
    const [decoded, bytesConsumed] = borshDecodeString(encoded, 0);
    assert.equal(decoded, original);
    assert.equal(bytesConsumed, encoded.length);
  });

  test("decodes at an offset", () => {
    const prefix = new Uint8Array(10).fill(0xff);
    const encoded = borshEncodeString("test");
    const combined = new Uint8Array(prefix.length + encoded.length);
    combined.set(prefix, 0);
    combined.set(encoded, prefix.length);
    const [decoded] = borshDecodeString(combined, 10);
    assert.equal(decoded, "test");
  });
});

describe("walletToMatrixUserId", () => {
  test("produces valid Matrix user ID format with solana_ prefix", () => {
    const bytes = new Uint8Array(32).fill(42);
    const base58 = bytesToBase58(bytes);
    const userId = walletToMatrixUserId(base58, "chat.example.com");
    assert.ok(userId.startsWith("@solana_"), "Must start with @solana_");
    assert.ok(userId.includes(":chat.example.com"), "Must contain server");
    assert.equal(userId.split(":")[0].length, 72, "@ + solana_ (7) + 64 hex chars = 72");
  });
});
