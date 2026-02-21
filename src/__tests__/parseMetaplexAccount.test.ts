/**
 * Tests for the Metaplex on-chain metadata parser.
 * The layout is: 1 (key) + 32 (update_auth) + 32 (mint) + 4+32 (name) + 4+10 (symbol)
 */

const METADATA_V1_KEY = 4;
const MAX_NAME = 32;
const MAX_SYMBOL = 10;

function parseMetaplexAccount(data: Buffer): { name: string; symbol: string } | null {
  if (data.length < 115 || data[0] !== METADATA_V1_KEY) return null;
  const name   = data.slice(69,  69  + MAX_NAME  ).toString("utf8").replace(/\0+$/, "").trim();
  const symbol = data.slice(105, 105 + MAX_SYMBOL).toString("utf8").replace(/\0+$/, "").trim();
  if (!name && !symbol) return null;
  return { name: name || "?", symbol: symbol || "?" };
}

function buildMetaplexBuffer(name: string, symbol: string): Buffer {
  const buf = Buffer.alloc(300, 0);
  buf[0] = METADATA_V1_KEY;
  // update_authority (32) + mint (32) = bytes 1–64 (left as 0)
  // name length at offset 65 (4 bytes LE)
  buf.writeUInt32LE(name.length, 65);
  buf.write(name.padEnd(MAX_NAME, "\0"), 69, "utf8");
  // symbol length at offset 101 (4 bytes LE)
  buf.writeUInt32LE(symbol.length, 101);
  buf.write(symbol.padEnd(MAX_SYMBOL, "\0"), 105, "utf8");
  return buf;
}

describe("parseMetaplexAccount", () => {
  it("parses name and symbol correctly", () => {
    const buf = buildMetaplexBuffer("USD Coin", "USDC");
    expect(parseMetaplexAccount(buf)).toEqual({ name: "USD Coin", symbol: "USDC" });
  });

  it("strips null padding from name and symbol", () => {
    const buf = buildMetaplexBuffer("My Token\0\0\0", "MTK\0\0\0\0");
    const result = parseMetaplexAccount(buf);
    expect(result?.name).toBe("My Token");
    expect(result?.symbol).toBe("MTK");
  });

  it("returns null for non-MetadataV1 key", () => {
    const buf = buildMetaplexBuffer("Token", "TKN");
    buf[0] = 1; // wrong key
    expect(parseMetaplexAccount(buf)).toBeNull();
  });

  it("returns null for buffer too short", () => {
    expect(parseMetaplexAccount(Buffer.alloc(50))).toBeNull();
  });

  it("returns null when both name and symbol are empty", () => {
    const buf = buildMetaplexBuffer("", "");
    expect(parseMetaplexAccount(buf)).toBeNull();
  });
});
