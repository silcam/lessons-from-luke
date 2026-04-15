import { ipcGet, ipcPost } from "./desktopAPIClient";

// Mock window.electronAPI
const mockInvoke = jest.fn();

beforeAll(() => {
  Object.defineProperty(window, "electronAPI", {
    value: { invoke: mockInvoke, on: jest.fn() },
    writable: true
  });
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ipcGet", () => {
  it("calls ipcRenderer.invoke with the route and params", async () => {
    mockInvoke.mockResolvedValueOnce({ data: { readyToTranslate: true } });

    const result = await ipcGet("/api/readyToTranslate", {});

    expect(mockInvoke).toHaveBeenCalledWith("/api/readyToTranslate", {});
    expect(result).toEqual({ readyToTranslate: true });
  });

  it("returns response.data when present", async () => {
    const data = { readyToTranslate: false };
    mockInvoke.mockResolvedValueOnce({ data });

    const result = await ipcGet("/api/readyToTranslate", {});

    expect(result).toEqual(data);
  });

  it("throws an AppError when response has an error field", async () => {
    const error = { type: "Unknown" };
    mockInvoke.mockResolvedValueOnce({ error });

    await expect(ipcGet("/api/readyToTranslate", {})).rejects.toEqual(error);
  });

  it("throws an AppError when ipcRenderer.invoke rejects", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("IPC failure"));

    await expect(ipcGet("/api/readyToTranslate", {})).rejects.toMatchObject({
      type: "Unknown"
    });
  });
});

describe("ipcPost", () => {
  it("calls ipcRenderer.invoke with route, params, and data", async () => {
    const syncState = {
      language: null,
      downSync: {
        languages: false,
        baseLessons: false,
        lessons: [],
        tStrings: {},
        timestamp: 1
      },
      syncLanguages: [],
      upSync: { dirtyTStrings: [] },
      connected: true,
      loaded: true
    };
    mockInvoke.mockResolvedValueOnce({ data: syncState });

    const result = await ipcPost("/api/syncState/code", {}, { code: "ABCDEF" });

    expect(mockInvoke).toHaveBeenCalledWith(
      "/api/syncState/code",
      {},
      { code: "ABCDEF" }
    );
    expect(result).toEqual(syncState);
  });

  it("returns response.data when present", async () => {
    const data = {
      language: null,
      downSync: {
        languages: false,
        baseLessons: false,
        lessons: [],
        tStrings: {},
        timestamp: 1
      },
      syncLanguages: [],
      upSync: { dirtyTStrings: [] },
      connected: false,
      loaded: false
    };
    mockInvoke.mockResolvedValueOnce({ data });

    const result = await ipcPost("/api/syncState/code", {}, { code: "XYZ" });

    expect(result).toEqual(data);
  });

  it("throws an AppError when response has an error field", async () => {
    const error = { type: "HTTP", status: 500 };
    mockInvoke.mockResolvedValueOnce({ error });

    await expect(
      ipcPost("/api/syncState/code", {}, { code: "XYZ" })
    ).rejects.toEqual(error);
  });

  it("throws an AppError when ipcRenderer.invoke rejects", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("IPC failure"));

    await expect(
      ipcPost("/api/syncState/code", {}, { code: "XYZ" })
    ).rejects.toMatchObject({ type: "Unknown" });
  });
});
