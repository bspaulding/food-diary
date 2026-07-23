const std = @import("std");
const Env = @import("llm_nutrition_api").Env;

pub const DEFAULT_AUDIENCE = "https://direct-satyr-14.hasura.app/v1/graphql";

pub const AuthError = error{
    MalformedToken,
    UnexpectedAlgorithm,
    InvalidHeader,
    InvalidPayload,
    InvalidSecretConfig,
    InvalidDer,
    SignatureVerificationFailed,
    TokenExpired,
    AudienceMismatch,
};

/// Verifies an Auth0 RS256 ID token against the public key embedded in
/// `jwt_secret_json` (HASURA_GRAPHQL_JWT_SECRET's JSON contents:
/// `{"key": "<PEM certificate>", ...}`, Auth0's standard JWKS x5c format —
/// an X.509 certificate, not a bare PEM public key), then checks `exp` and
/// `aud`. `aud` may be a single string or an array of strings; it matches
/// if it contains `audience`.
///
/// There is no RSA support in Zig's std.crypto, so this hand-rolls minimal
/// ASN.1 DER parsing (to pull the RSA public key out of the X.509
/// certificate) and modular exponentiation (via std.math.big.int) to do
/// PKCS#1 v1.5 signature verification.
pub fn validateJwt(
    env: Env,
    token: []const u8,
    jwt_secret_json: []const u8,
    audience: []const u8,
) !void {
    const allocator = env.allocator;

    // Every allocation here is flat and single-use within this function
    // body (nothing has a lifetime spanning a loop or multiple rounds the
    // way the LLM agent's conversation history does), so each gets its own
    // `defer` instead of a scratch arena -- same discipline as `modPow`
    // below, and it makes `std.testing.allocator` a meaningful leak check
    // rather than something that only passes because of a wrapping arena.
    var secret_parsed = std.json.parseFromSlice(std.json.Value, allocator, jwt_secret_json, .{ .ignore_unknown_fields = true }) catch
        return error.InvalidSecretConfig;
    defer secret_parsed.deinit();
    const key_val = secret_parsed.value.object.get("key") orelse return error.InvalidSecretConfig;
    if (key_val != .string) return error.InvalidSecretConfig;

    const cert_der = try pemToDer(allocator, key_val.string);
    defer allocator.free(cert_der);
    const pubkey = try extractRsaPublicKey(cert_der);

    var parts = std.mem.splitScalar(u8, token, '.');
    const header_b64 = parts.next() orelse return error.MalformedToken;
    const payload_b64 = parts.next() orelse return error.MalformedToken;
    const sig_b64 = parts.next() orelse return error.MalformedToken;
    if (parts.next() != null) return error.MalformedToken;

    const header_bytes = b64UrlDecode(allocator, header_b64) catch return error.MalformedToken;
    defer allocator.free(header_bytes);
    var header_parsed = std.json.parseFromSlice(std.json.Value, allocator, header_bytes, .{ .ignore_unknown_fields = true }) catch
        return error.InvalidHeader;
    defer header_parsed.deinit();
    const alg_val = header_parsed.value.object.get("alg") orelse return error.InvalidHeader;
    if (alg_val != .string or !std.mem.eql(u8, alg_val.string, "RS256")) return error.UnexpectedAlgorithm;

    const signature = b64UrlDecode(allocator, sig_b64) catch return error.MalformedToken;
    defer allocator.free(signature);

    const signing_input = token[0 .. header_b64.len + 1 + payload_b64.len];
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(signing_input, &digest, .{});

    if (!try verifyPkcs1Sha256(allocator, signature, pubkey.n, pubkey.e, &digest)) {
        return error.SignatureVerificationFailed;
    }

    const payload_bytes = b64UrlDecode(allocator, payload_b64) catch return error.MalformedToken;
    defer allocator.free(payload_bytes);
    var payload_parsed = std.json.parseFromSlice(std.json.Value, allocator, payload_bytes, .{ .ignore_unknown_fields = true }) catch
        return error.InvalidPayload;
    defer payload_parsed.deinit();

    if (payload_parsed.value.object.get("exp")) |exp_val| {
        const exp: i64 = switch (exp_val) {
            .integer => |i| i,
            .float => |f| @intFromFloat(f),
            else => return error.InvalidPayload,
        };
        if (exp < std.Io.Clock.real.now(env.io).toSeconds()) return error.TokenExpired;
    }

    if (!audMatches(payload_parsed.value, audience)) return error.AudienceMismatch;
}

fn audMatches(payload: std.json.Value, expected: []const u8) bool {
    if (payload != .object) return false;
    const aud = payload.object.get("aud") orelse return false;
    switch (aud) {
        .string => |s| return std.mem.eql(u8, s, expected),
        .array => |arr| {
            for (arr.items) |item| {
                if (item == .string and std.mem.eql(u8, item.string, expected)) return true;
            }
            return false;
        },
        else => return false,
    }
}

fn b64UrlDecode(allocator: std.mem.Allocator, s: []const u8) ![]u8 {
    const decoder = std.base64.url_safe_no_pad.Decoder;
    const len = try decoder.calcSizeForSlice(s);
    const out = try allocator.alloc(u8, len);
    errdefer allocator.free(out);
    try decoder.decode(out, s);
    return out;
}

fn pemToDer(allocator: std.mem.Allocator, pem: []const u8) ![]u8 {
    var b64_buf: std.ArrayList(u8) = .empty;
    defer b64_buf.deinit(allocator);
    var lines = std.mem.splitAny(u8, pem, "\r\n");
    while (lines.next()) |line| {
        const trimmed = std.mem.trim(u8, line, " \t");
        if (trimmed.len == 0 or std.mem.startsWith(u8, trimmed, "-----")) continue;
        try b64_buf.appendSlice(allocator, trimmed);
    }
    const decoder = std.base64.standard.Decoder;
    const len = decoder.calcSizeForSlice(b64_buf.items) catch return error.InvalidDer;
    const der = try allocator.alloc(u8, len);
    errdefer allocator.free(der);
    decoder.decode(der, b64_buf.items) catch return error.InvalidDer;
    return der;
}

const Tlv = struct { tag: u8, value: []const u8 };

/// Reads one DER tag-length-value triple starting at `pos.*`, advancing it
/// past the value.
fn readTlv(data: []const u8, pos: *usize) !Tlv {
    if (pos.* >= data.len) return error.InvalidDer;
    const tag = data[pos.*];
    pos.* += 1;
    if (pos.* >= data.len) return error.InvalidDer;

    var len: usize = data[pos.*];
    pos.* += 1;
    if (len & 0x80 != 0) {
        const num_bytes: usize = len & 0x7f;
        if (num_bytes == 0 or num_bytes > 4) return error.InvalidDer;
        if (pos.* + num_bytes > data.len) return error.InvalidDer;
        len = 0;
        for (0..num_bytes) |_| {
            len = (len << 8) | data[pos.*];
            pos.* += 1;
        }
    }
    if (pos.* + len > data.len) return error.InvalidDer;
    const value = data[pos.* .. pos.* + len];
    pos.* += len;
    return .{ .tag = tag, .value = value };
}

fn stripLeadingZero(b: []const u8) []const u8 {
    if (b.len > 1 and b[0] == 0) return b[1..];
    return b;
}

const RsaPublicKey = struct { n: []const u8, e: []const u8 };

/// Walks Certificate -> tbsCertificate -> subjectPublicKeyInfo -> RSAPublicKey
/// to pull out the modulus and exponent, per RFC 5280 / RFC 8017's
/// structural layout for a standard X.509v3 RSA certificate.
fn extractRsaPublicKey(cert_der: []const u8) !RsaPublicKey {
    var pos: usize = 0;
    const cert_seq = try readTlv(cert_der, &pos); // Certificate ::= SEQUENCE

    var tbs_pos: usize = 0;
    const tbs_seq = try readTlv(cert_seq.value, &tbs_pos); // tbsCertificate ::= SEQUENCE

    const data = tbs_seq.value;
    var p: usize = 0;
    if (p < data.len and data[p] == 0xA0) {
        _ = try readTlv(data, &p); // version [0] EXPLICIT (optional)
    }
    _ = try readTlv(data, &p); // serialNumber
    _ = try readTlv(data, &p); // signature AlgorithmIdentifier
    _ = try readTlv(data, &p); // issuer
    _ = try readTlv(data, &p); // validity
    _ = try readTlv(data, &p); // subject
    const spki = try readTlv(data, &p); // subjectPublicKeyInfo ::= SEQUENCE

    var sp: usize = 0;
    _ = try readTlv(spki.value, &sp); // algorithm AlgorithmIdentifier
    const bitstring = try readTlv(spki.value, &sp); // subjectPublicKey ::= BIT STRING
    if (bitstring.value.len < 1) return error.InvalidDer;
    const rsa_der = bitstring.value[1..]; // skip "unused bits" count byte

    var rp: usize = 0;
    const rsa_seq = try readTlv(rsa_der, &rp); // RSAPublicKey ::= SEQUENCE
    var ri: usize = 0;
    const n_tlv = try readTlv(rsa_seq.value, &ri); // modulus INTEGER
    const e_tlv = try readTlv(rsa_seq.value, &ri); // publicExponent INTEGER

    return .{ .n = stripLeadingZero(n_tlv.value), .e = stripLeadingZero(e_tlv.value) };
}

const hex_chars = "0123456789abcdef";

/// std.fmt.bytesToHex requires a comptime-known length, which doesn't work
/// for the runtime-length DER-extracted modulus/exponent/signature bytes
/// here, so this hand-rolls the (trivial) hex encoding instead.
fn bytesToHexAlloc(allocator: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const out = try allocator.alloc(u8, bytes.len * 2);
    for (bytes, 0..) |b, i| {
        out[i * 2] = hex_chars[b >> 4];
        out[i * 2 + 1] = hex_chars[b & 0xF];
    }
    return out;
}

fn bigFromBytes(allocator: std.mem.Allocator, bytes: []const u8) !std.math.big.int.Managed {
    var m = try std.math.big.int.Managed.init(allocator);
    errdefer m.deinit();
    if (bytes.len == 0) {
        try m.set(0);
        return m;
    }
    const hex = try bytesToHexAlloc(allocator, bytes);
    defer allocator.free(hex);
    try m.setString(16, hex);
    return m;
}

/// Computes `base^exp mod modulus`, returning a big-endian byte slice of
/// length `modulus.len` (zero-padded on the left), allocated from `allocator`.
fn modPow(allocator: std.mem.Allocator, base_bytes: []const u8, exp_bytes: []const u8, modulus_bytes: []const u8) ![]u8 {
    const Managed = std.math.big.int.Managed;

    var modulus = try bigFromBytes(allocator, modulus_bytes);
    defer modulus.deinit();

    var base = try bigFromBytes(allocator, base_bytes);
    defer base.deinit();
    {
        var q = try Managed.init(allocator);
        defer q.deinit();
        var r = try Managed.init(allocator);
        defer r.deinit();
        try q.divTrunc(&r, &base, &modulus);
        try base.copy(r.toConst());
    }

    var exp = try bigFromBytes(allocator, exp_bytes);
    defer exp.deinit();

    var result = try Managed.init(allocator);
    defer result.deinit();
    try result.set(1);

    while (!exp.eqlZero()) {
        if (exp.isOdd()) {
            var mul_tmp = try Managed.init(allocator);
            defer mul_tmp.deinit();
            try mul_tmp.mul(&result, &base);
            var q = try Managed.init(allocator);
            defer q.deinit();
            var r = try Managed.init(allocator);
            defer r.deinit();
            try q.divTrunc(&r, &mul_tmp, &modulus);
            try result.copy(r.toConst());
        }

        {
            var sq_tmp = try Managed.init(allocator);
            defer sq_tmp.deinit();
            try sq_tmp.mul(&base, &base);
            var q = try Managed.init(allocator);
            defer q.deinit();
            var r = try Managed.init(allocator);
            defer r.deinit();
            try q.divTrunc(&r, &sq_tmp, &modulus);
            try base.copy(r.toConst());
        }

        try exp.shiftRight(&exp, 1);
    }

    const out = try allocator.alloc(u8, modulus_bytes.len);
    result.toConst().writeTwosComplement(out, .big);
    return out;
}

/// The fixed ASN.1 DigestInfo prefix for SHA-256, per RFC 8017 Appendix A.
/// (the DER encoding of `SEQUENCE { SEQUENCE { OID sha256, NULL }, OCTET STRING }`
/// with the OCTET STRING's 32-byte digest appended separately).
const sha256_digest_info_prefix = [_]u8{
    0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48,
    0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04,
    0x20,
};

fn verifyPkcs1Sha256(allocator: std.mem.Allocator, signature: []const u8, n: []const u8, e: []const u8, digest: *const [32]u8) !bool {
    const em = try modPow(allocator, signature, e, n);
    defer allocator.free(em);
    return pkcs1CheckEncoding(em, digest);
}

/// Checks `em` against the RSASSA-PKCS1-v1_5 encoded message for SHA-256:
/// `0x00 0x01 0xFF..0xFF 0x00 DigestInfo(digest)`.
fn pkcs1CheckEncoding(em: []const u8, digest: *const [32]u8) bool {
    const t_len = sha256_digest_info_prefix.len + digest.len;
    const k = em.len;
    if (k < t_len + 11) return false;
    if (em[0] != 0x00 or em[1] != 0x01) return false;

    const ps_len = k - 3 - t_len;
    for (em[2 .. 2 + ps_len]) |byte| {
        if (byte != 0xFF) return false;
    }
    if (em[2 + ps_len] != 0x00) return false;

    const t_start = 3 + ps_len;
    var ok: u8 = 0;
    for (sha256_digest_info_prefix, em[t_start .. t_start + sha256_digest_info_prefix.len]) |a, b| {
        ok |= a ^ b;
    }
    for (digest, em[t_start + sha256_digest_info_prefix.len ..]) |a, b| {
        ok |= a ^ b;
    }
    return ok == 0;
}

test "modPow matches simple modular exponentiation" {
    const allocator = std.testing.allocator;
    // 4^13 mod 497 = 445 (textbook RSA example)
    const out = try modPow(allocator, &[_]u8{4}, &[_]u8{13}, &[_]u8{ 1, 241 });
    defer allocator.free(out);
    try std.testing.expectEqualSlices(u8, &[_]u8{ 1, 189 }, out); // 445 = 0x01BD
}

test "pkcs1CheckEncoding accepts well-formed EM and rejects tampering" {
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash("hello", &digest, .{});

    const k = 64;
    var em: [k]u8 = undefined;
    em[0] = 0x00;
    em[1] = 0x01;
    const t_len = sha256_digest_info_prefix.len + digest.len;
    const ps_len = k - 3 - t_len;
    @memset(em[2 .. 2 + ps_len], 0xFF);
    em[2 + ps_len] = 0x00;
    @memcpy(em[3 + ps_len ..][0..sha256_digest_info_prefix.len], &sha256_digest_info_prefix);
    @memcpy(em[3 + ps_len + sha256_digest_info_prefix.len ..], &digest);

    try std.testing.expect(pkcs1CheckEncoding(&em, &digest));

    var tampered = em;
    tampered[k - 1] ^= 0x01;
    try std.testing.expect(!pkcs1CheckEncoding(&tampered, &digest));
}

// Fixtures below exercise the full `validateJwt` path end-to-end (DER
// parsing, modpow, PKCS#1 verification, exp/aud checks) against a real
// self-signed RSA-2048 certificate and RS256-signed tokens. Generated once
// via openssl + a small Python script (not checked in) and pasted here as
// fixed test data; the
// "valid"/"default_audience" tokens carry a far-future `exp` so they never
// expire, and "expired" carries a fixed past `exp` so it always fails.
const TEST_SECRET_JSON = "{\"type\": \"RS512\", \"key\": \"-----BEGIN CERTIFICATE-----\\nMIIDATCCAemgAwIBAgIUMdl/Wb5QCsyOl3SkQ/gkogfyXJMwDQYJKoZIhvcNAQEL\\nBQAwDzENMAsGA1UEAwwEdGVzdDAgFw0yNjA3MjEyMzQ1NDFaGA8yMTI2MDYyNzIz\\nNDU0MVowDzENMAsGA1UEAwwEdGVzdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCC\\nAQoCggEBAMBTQ90c8gkipsmvp9UE6lrEkdzPBc3n8m+5Qq2lhjgF8oVwVsKrVyLo\\nZ3QoAE+wAAk5X/EGfYQDTWI/ZNwaUiwm4oqU10FIhhUcAxGwY9MbYBamW4qMoRjo\\necvbRnq7aofGMhPKoxcjJ3gEDZgiSFb47LK5cV2H+jGI0EkmBx21QHMIMva4BNv8\\nSpg70HaOxlf+rs7gMNSLK/ai0UdZ21KTQEH8c6sE42IBfnHo8d8q/C055jnZkjue\\n3npqOVy5F1Fg58ISKxJLZng5MXvJ7tfyrlytWAVr3c39ZxqO3NV27SUsmLNEuD3r\\nQpEVYQMrZ6Is8JJsv+so5JB58u+cR08CAwEAAaNTMFEwHQYDVR0OBBYEFMTcReHu\\n0SumTvOrTksLNqitVLzYMB8GA1UdIwQYMBaAFMTcReHu0SumTvOrTksLNqitVLzY\\nMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAMBFi2skNIOusp07\\ngIiZ6J2S6qs1sUxFn351c5DgMjNIpk67GSigP8iIVs+dmlNkOBaEOVSczMWQC9VH\\njVCMszpGfqTV9Ecom5XbfEB4Zl9odoAqHIuidRwJZ1qPQdD64f5HOw998bGUexpj\\noLrr6EQUG/VHNvIwb2pKt7FJCHLOxf2w6o9DAtgT2EIRF37+n+NnkBjmiSnrhEic\\nrUfdcbiMaisa2/Uy86ETnAtJT414ehpppefh0/7gx1SZM18KLfgNOB7oDVCh4XF7\\naTSbOnjZUxgJyVWWQMsZxa9/OHJypWo/nYSA5FmNt4ywx/w+WhgTj40/z/n3k0J7\\nXEb6f4w=\\n-----END CERTIFICATE-----\\n\"}";
const TEST_TOKEN_VALID_ARRAY_AUD = "eyJhbGciOiAiUlMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAiYXV0aDB8dXNlci0xMjMiLCAiYXVkIjogWyJodHRwczovL2RpcmVjdC1zYXR5ci0xNC5oYXN1cmEuYXBwL3YxL2dyYXBocWwiLCAiaHR0cHM6Ly9tb3RpbmdvLmF1dGgwLmNvbS91c2VyaW5mbyJdLCAiZXhwIjogMjEwMDAzNzU1N30.pGyMt6_FrNB7NdxvpTbQ7mApiEQJ3r3y9bUYyU5_7VZezwGtvz5fuBAAyhLKGLFzXrEm9ioYdldIcNsA16cYEWsCYedNzfy7MLTYCPsYUq5nJmLdVQwK8amIdj1heLmqNY3vfjt4dhcySgc0pd9gEg3p6ffi1AdTcCXORfu-wXinhP-9SXu6UO1VzMxpGadOgCrlA__OkmCsD4oXtwXWKgTVTw0wvxHTVfVdzY0X_dSN1Z5n2bHlTSq8VVKxrsRmZ5qKpZO76kQfsCYJ0R8qtzVEBjBEEubcwBlBb-D0tvZmvLL1Vw08cKu7RbMVWkvq9Genmjd_vcW-NDU3LeAlzQ";
const TEST_TOKEN_VALID_STRING_AUD = "eyJhbGciOiAiUlMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAiYXV0aDB8dXNlci0xMjMiLCAiYXVkIjogImh0dHBzOi8vZGlyZWN0LXNhdHlyLTE0Lmhhc3VyYS5hcHAvdjEvZ3JhcGhxbCIsICJleHAiOiAyMTAwMDM3NTU3fQ.cKCI3sQrTGwRcsg7ou2mqMmhohkYJS_gilgA-6dRHV9wBFKcAU6haes_2RkEoHfCvjUpz7u0V45IQj7lS33EDCPoRAD9sYOZ5tTAYZRIiOAHR8YKLSTRJwG3kshZ__JVDT81GylRSOYzGlHYDDXn4dihqKkEbkydYUtRwR67SCH_ATUjNVAJb2L7IxySqs8jR-hy9BWKDTM2ilYgHuv2aT--D_g7LKvfDuo3LSJukibVNn9iWwbq8OrxG_5bkZ3HMqC-lxCUe3x8OVXzbZ5-au1oFGumIYPm8_0heXm1xiGZ0kmybIChzTyDCuby3gxttHWUMmlVf_s-_S9ET1P2yg";
const TEST_TOKEN_WRONG_ALG = "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAiYXV0aDB8dXNlci0xMjMiLCAiYXVkIjogImh0dHBzOi8vZGlyZWN0LXNhdHlyLTE0Lmhhc3VyYS5hcHAvdjEvZ3JhcGhxbCIsICJleHAiOiAyMTAwMDM3NTU3fQ.mHacULhwue191sRNqBOxxFs0N9RHRig-7Eg9-DFf3amBnqh20tdheNDZ1Vpq_HeD43VvD3i-wcO-kzCeX1Wc5Hf_ykUh6t46dhgeOyCW5mohq3keVzc-9hT1yElnABNL6n0n5lkmcBoMAvK3qxIIZTG1XG9XFlhJ-cexA0QrdrvWhwiDu70bgazXSZZu3vCyNnQNCWSE4NcaIJnRmP4XoFqiObFsocmt4q-uzvcz4BOOt6ARO-_IXiYQz0CtLVADCQgGL831fS1hfs31W8_2UUrZ95_ecY7oUB7JxyhTb2r1ounE6eblGSpOxSwib3IqFMU8lVy0WzsZxL7ID9KXQQ";
const TEST_TOKEN_WRONG_KEY = "eyJhbGciOiAiUlMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAiYXV0aDB8dXNlci0xMjMiLCAiYXVkIjogImh0dHBzOi8vZGlyZWN0LXNhdHlyLTE0Lmhhc3VyYS5hcHAvdjEvZ3JhcGhxbCIsICJleHAiOiAyMTAwMDM3NTU3fQ.Q24ZZF4yy3EanWZvhI9e3FKpCfgZCdL-uM-VQwn1rFBW5Sl520G1s-hL61hJ-s6Pb85Uw1_CEPxGQ3nwkoqEQHWuW1VO-a8iaVh_3liSzIhjfSnpb7RG6AjcmyoH6JOZbctQX4L64OMos9WdQHAIBsFP4yuZR6CLYudfF2BVF_HlH1htvQrhnblPzN4YAKLQML3KvDT3I4d49qmoJsftJ6Og74dOTxHIjrirQZjYkqc9UilsUOM6k3ykC_o3rsADba6_KNnOKtMbB9fPCxGJhK8omqxciVpi03yFkWSNpIe_ZsQHUooxO2NKMRPqvDiYKK1_E8t72vRm8sRmqYAQPQ";
const TEST_TOKEN_WRONG_AUD = "eyJhbGciOiAiUlMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAiYXV0aDB8dXNlci0xMjMiLCAiYXVkIjogWyJodHRwczovL3dyb25nLmV4YW1wbGUuY29tIl0sICJleHAiOiAyMTAwMDM3NTU3fQ.EVyo3VqtVBpcvbg9kGAoVQyBP4BkyjYe97aCLbiQcnmfMxC7Y2YWYcITajfXlIOOIILV4BRK9h4GsBBJnzza3cEAuHlY9b6IZF8tAGHhhvR4xwS3Eu7dCOAZvmexCpvcVz7Kr_ZSaPM8mif_KjgshumSoStbZ_qlD1dfrmVIEAAYFb8Y3YYnXTSqNgrYYYJ0_ozvW1Rb3LXeoHKUIgy2SobmzkFutdOEC6PW1-q-qwdIQ7fSVXI4Me-YAPrwjPaFI7FSNLq_72wqIkQVkWlBPD4eH4jPx-F2f8ALAaF0B2RWplwFTQDFDzW0B5RFaBFv6L7tPExGO9rBd1AtCQWqww";
const TEST_TOKEN_EXPIRED = "eyJhbGciOiAiUlMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAiYXV0aDB8dXNlci0xMjMiLCAiYXVkIjogImh0dHBzOi8vZGlyZWN0LXNhdHlyLTE0Lmhhc3VyYS5hcHAvdjEvZ3JhcGhxbCIsICJleHAiOiAxNzg0NjczOTU3fQ.OzTk0WQ1wrlrsJJMIcjx-JlCXkjgLQfkXIMwPzPgac4b4o6-OAGmh6HizcOpZYE1Rv9EMoZHF0_VQCYWjYLJIGSw0ERwPHO8iCVtqe2Uuw-yLz8R0XrnbJRuyj-OXBPS1wG1vdvFmoH1j6nuQEwazMbA4SJfXkLst6kDGLNlEQD_PRj1Dkns80gJMZVxNgwXadJC3gV-1GiKUOItEsdDciBsQzWSfom7PHNFN1Klb4DldtS2D3Z0UWoF8ujCNmJizn2mRnG4aYv83KP4mdz1YImL7J8zsgyRWQuVkASW1fCKK79PoZjCrHDS1IAKnX_5X4-25JCCIUs3uBF4Etm6Zw";
const TEST_TOKEN_DEFAULT_AUD = "eyJhbGciOiAiUlMyNTYiLCAidHlwIjogIkpXVCJ9.eyJzdWIiOiAiYXV0aDB8dXNlci0xMjMiLCAiYXVkIjogImh0dHBzOi8vZGlyZWN0LXNhdHlyLTE0Lmhhc3VyYS5hcHAvdjEvZ3JhcGhxbCIsICJleHAiOiAyMTAwMDM3NTU3fQ.cKCI3sQrTGwRcsg7ou2mqMmhohkYJS_gilgA-6dRHV9wBFKcAU6haes_2RkEoHfCvjUpz7u0V45IQj7lS33EDCPoRAD9sYOZ5tTAYZRIiOAHR8YKLSTRJwG3kshZ__JVDT81GylRSOYzGlHYDDXn4dihqKkEbkydYUtRwR67SCH_ATUjNVAJb2L7IxySqs8jR-hy9BWKDTM2ilYgHuv2aT--D_g7LKvfDuo3LSJukibVNn9iWwbq8OrxG_5bkZ3HMqC-lxCUe3x8OVXzbZ5-au1oFGumIYPm8_0heXm1xiGZ0kmybIChzTyDCuby3gxttHWUMmlVf_s-_S9ET1P2yg";

const test_env = Env{ .io = std.testing.io, .allocator = std.testing.allocator };

test "validateJwt accepts a valid token with array audience" {
    try validateJwt(test_env, TEST_TOKEN_VALID_ARRAY_AUD, TEST_SECRET_JSON, DEFAULT_AUDIENCE);
}

test "validateJwt accepts a valid token with string audience" {
    try validateJwt(test_env, TEST_TOKEN_VALID_STRING_AUD, TEST_SECRET_JSON, DEFAULT_AUDIENCE);
}

test "validateJwt rejects wrong algorithm" {
    try std.testing.expectError(error.UnexpectedAlgorithm, validateJwt(test_env, TEST_TOKEN_WRONG_ALG, TEST_SECRET_JSON, DEFAULT_AUDIENCE));
}

test "validateJwt rejects wrong signing key" {
    try std.testing.expectError(error.SignatureVerificationFailed, validateJwt(test_env, TEST_TOKEN_WRONG_KEY, TEST_SECRET_JSON, DEFAULT_AUDIENCE));
}

test "validateJwt rejects wrong audience" {
    try std.testing.expectError(error.AudienceMismatch, validateJwt(test_env, TEST_TOKEN_WRONG_AUD, TEST_SECRET_JSON, DEFAULT_AUDIENCE));
}

test "validateJwt rejects expired token" {
    try std.testing.expectError(error.TokenExpired, validateJwt(test_env, TEST_TOKEN_EXPIRED, TEST_SECRET_JSON, DEFAULT_AUDIENCE));
}

test "validateJwt falls back to default audience" {
    try validateJwt(test_env, TEST_TOKEN_DEFAULT_AUD, TEST_SECRET_JSON, DEFAULT_AUDIENCE);
}

test "validateJwt rejects malformed secret config" {
    try std.testing.expectError(error.InvalidSecretConfig, validateJwt(test_env, TEST_TOKEN_VALID_STRING_AUD, "{}", DEFAULT_AUDIENCE));
}

test "audMatches handles string and array forms" {
    const allocator = std.testing.allocator;

    {
        var parsed = try std.json.parseFromSlice(std.json.Value, allocator, "{\"aud\": \"foo\"}", .{});
        defer parsed.deinit();
        try std.testing.expect(audMatches(parsed.value, "foo"));
        try std.testing.expect(!audMatches(parsed.value, "bar"));
    }
    {
        var parsed = try std.json.parseFromSlice(std.json.Value, allocator, "{\"aud\": [\"foo\", \"bar\"]}", .{});
        defer parsed.deinit();
        try std.testing.expect(audMatches(parsed.value, "bar"));
        try std.testing.expect(!audMatches(parsed.value, "baz"));
    }
}
