/**
 * @jest-environment node
 */
import { POST } from "@/app/api/prices/route";
import { NextRequest } from "next/server";

const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/prices", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/prices – validation", () => {
  it("returns 400 for null body", async () => {
    const req = new NextRequest("http://localhost/api/prices", {
      method: "POST",
      body: JSON.stringify(null),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when mints is not an array", async () => {
    const res = await POST(makeReq({ mints: "SOL" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when too many mints", async () => {
    const mints = Array.from({ length: 51 }, (_, i) => `mint${i}`);
    const res = await POST(makeReq({ mints }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when a mint is not a string", async () => {
    const res = await POST(makeReq({ mints: [12345] }));
    expect(res.status).toBe(400);
  });

  it("returns empty result for empty mints array", async () => {
    const res = await POST(makeReq({ mints: [] }));
    expect(await res.json()).toEqual({ prices: {}, eurRate: null });
  });
});

describe("POST /api/prices – happy path", () => {
  it("returns prices and EUR rate", async () => {
    const mint = "So11111111111111111111111111111111111111112";
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("dexscreener")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { chainId: "solana", baseToken: { address: mint }, priceUsd: "185.50" },
            ]),
        });
      }
      if (url.includes("frankfurter")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rates: { EUR: 0.92 } }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const res = await POST(makeReq({ mints: [mint] }));
    const data = await res.json();

    expect(data.prices[mint]).toBeCloseTo(185.5);
    expect(data.eurRate).toBeCloseTo(0.92);
  });
});

describe("POST /api/prices – error handling", () => {
  it("returns null prices when DexScreener fails, but still returns eurRate", async () => {
    const mint = "DexFailMintUniqueA1111111111111111111111111";
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("dexscreener")) return Promise.reject(new Error("network error"));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ rates: { EUR: 0.91 } }),
      });
    });

    const res = await POST(makeReq({ mints: [mint] }));
    const data = await res.json();

    expect(data.prices[mint]).toBeNull();
    expect(data.eurRate).toBeCloseTo(0.91);
  });

  it("returns null eurRate when Frankfurter fails, but still returns prices", async () => {
    const mint = "FrankFailMintUniqueB111111111111111111111111";
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("frankfurter")) return Promise.reject(new Error("network error"));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });

    const res = await POST(makeReq({ mints: [mint] }));
    const data = await res.json();

    expect(data.eurRate).toBeNull();
    expect(data.prices).toBeDefined();
  });
});
