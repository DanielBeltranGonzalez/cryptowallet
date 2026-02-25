/**
 * @jest-environment node
 */
import { Connection, Keypair } from "@solana/web3.js";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/balances/route";

// Keep real PublicKey/Keypair for address validation; mock only Connection
jest.mock("@solana/web3.js", () => {
  const actual = jest.requireActual("@solana/web3.js") as typeof import("@solana/web3.js");
  return { ...actual, Connection: jest.fn() };
});

// Mock fetch so the token list fetch fails gracefully (empty cache)
global.fetch = jest.fn().mockResolvedValue({
  ok: false,
  status: 500,
  json: () => Promise.resolve({}),
} as unknown as Response);

const mockConnection = {
  getBalance: jest.fn(),
  getTokenAccountsByOwner: jest.fn(),
  getMultipleAccountsInfo: jest.fn(),
  getSignaturesForAddress: jest.fn(),
};

(Connection as jest.Mock).mockImplementation(() => mockConnection);

const TEST_ADDRESS = Keypair.generate().publicKey.toBase58();

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/balances", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (Connection as jest.Mock).mockImplementation(() => mockConnection);
  mockConnection.getTokenAccountsByOwner.mockResolvedValue({ value: [] });
  mockConnection.getMultipleAccountsInfo.mockResolvedValue([]);
  mockConnection.getSignaturesForAddress.mockResolvedValue([]);
});

describe("POST /api/balances – validation", () => {
  it("returns 400 for null body", async () => {
    const req = new NextRequest("http://localhost/api/balances", {
      method: "POST",
      body: JSON.stringify(null),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when addresses is not an array", async () => {
    const res = await POST(makeReq({ addresses: "abc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when too many addresses", async () => {
    const addresses = Array.from({ length: 21 }, () => TEST_ADDRESS);
    const res = await POST(makeReq({ addresses }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when an address is not a string", async () => {
    const res = await POST(makeReq({ addresses: [12345] }));
    expect(res.status).toBe(400);
  });

  it("returns empty object for empty addresses array", async () => {
    const res = await POST(makeReq({ addresses: [] }));
    expect(await res.json()).toEqual({});
  });
});

describe("POST /api/balances – address processing", () => {
  it("returns invalid status for a bad Solana address", async () => {
    const res = await POST(makeReq({ addresses: ["not-a-valid-address"], force: true }));
    const data = await res.json();
    expect(data["not-a-valid-address"]).toEqual({ status: "invalid" });
  });

  it("returns error status when connection fails", async () => {
    jest.useFakeTimers();
    try {
      mockConnection.getBalance.mockRejectedValue(new Error("Connection refused"));

      const postPromise = POST(
        makeReq({ addresses: [TEST_ADDRESS], force: true })
      );
      await jest.runAllTimersAsync();
      const res = await postPromise;
      const data = await res.json();

      expect(data[TEST_ADDRESS]).toMatchObject({ status: "error" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("returns ok status with sol balance and empty tokens", async () => {
    jest.useFakeTimers();
    try {
      mockConnection.getBalance.mockResolvedValue(2_500_000_000); // 2.5 SOL

      const postPromise = POST(
        makeReq({ addresses: [TEST_ADDRESS], force: true })
      );
      await jest.runAllTimersAsync();
      const res = await postPromise;
      const data = await res.json();

      expect(data[TEST_ADDRESS]).toMatchObject({
        status: "ok",
        sol: 2.5,
        tokens: [],
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
