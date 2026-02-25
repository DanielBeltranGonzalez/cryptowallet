/**
 * @jest-environment node
 */
import fs from "fs";
import { GET, POST } from "@/app/api/views/route";

jest.mock("fs");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/views", () => {
  it("returns count from file", async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ count: 42 }));
    const res = await GET();
    expect(await res.json()).toEqual({ count: 42 });
  });

  it("returns 0 when file is missing", async () => {
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const res = await GET();
    expect(await res.json()).toEqual({ count: 0 });
  });

  it("returns 0 for corrupted file", async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue("not-valid-json");
    const res = await GET();
    expect(await res.json()).toEqual({ count: 0 });
  });
});

describe("POST /api/views", () => {
  it("increments count and writes to file", async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ count: 7 }));
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    const res = await POST();
    expect(await res.json()).toEqual({ count: 8 });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify({ count: 8 }),
      "utf-8"
    );
  });

  it("starts from 1 when file is missing", async () => {
    (fs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
    const res = await POST();
    expect(await res.json()).toEqual({ count: 1 });
  });

  it("still returns incremented count when write fails", async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ count: 3 }));
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {
      throw new Error("EROFS");
    });
    const res = await POST();
    expect(await res.json()).toEqual({ count: 4 });
  });
});
