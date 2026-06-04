/// <reference types="jest" />

import { webGet, webPost, postFile } from "./WebAPIClient";

jest.mock("axios");
import Axios from "axios";
const mockedAxios = Axios as jest.Mocked<typeof Axios>;

describe("webGet", () => {
  test("returns response data on success", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [{ languageId: 1, name: "English" }],
      headers: { "content-length": "42" }
    } as any);

    const result = await webGet("/api/languages", {});
    expect(result).toEqual([{ languageId: 1, name: "English" }]);
    expect(mockedAxios.get).toHaveBeenCalledWith("/api/languages");
  });

  test("uses baseUrl when provided", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [],
      headers: { "content-length": "2" }
    } as any);

    await webGet("/api/languages", {}, "http://example.com");
    expect(mockedAxios.get).toHaveBeenCalledWith("http://example.com/api/languages");
  });

  test("interpolates route params", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: null,
      headers: { "content-length": "4" }
    } as any);

    await webGet("/api/lessons/:lessonId", { lessonId: 5 });
    expect(mockedAxios.get).toHaveBeenCalledWith("/api/lessons/5");
  });

  test("throws AppError with type 'No Connection' when no response received", async () => {
    mockedAxios.get.mockRejectedValueOnce({ request: {}, response: null });

    await expect(webGet("/api/languages", {})).rejects.toMatchObject({
      type: "No Connection"
    });
  });

  test("throws AppError with type 'HTTP' when server returns error status", async () => {
    mockedAxios.get.mockRejectedValueOnce({
      request: {},
      response: { status: 404 }
    });

    await expect(webGet("/api/languages", {})).rejects.toMatchObject({
      type: "HTTP",
      status: 404
    });
  });

  test("throws AppError with type 'Unknown' for unexpected errors", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("network failure"));

    await expect(webGet("/api/languages", {})).rejects.toMatchObject({
      type: "Unknown"
    });
  });

  test("interpolates multiple params in one route", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: null,
      headers: { "content-length": "4" }
    } as any);

    await webGet(
      "/api/languages/:languageId/lessons/:lessonId" as any,
      { languageId: 5, lessonId: 10 } as any
    );
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "/api/languages/5/lessons/10"
    );
  });

  test("interpolates numeric param values", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: null,
      headers: { "content-length": "4" }
    } as any);

    await webGet("/api/lessons/:lessonId" as any, { lessonId: 42 } as any);
    expect(mockedAxios.get).toHaveBeenCalledWith("/api/lessons/42");
  });

  test("leaves route unchanged when params object is empty", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [],
      headers: { "content-length": "2" }
    } as any);

    await webGet("/api/languages", {});
    expect(mockedAxios.get).toHaveBeenCalledWith("/api/languages");
  });
});

describe("webPost", () => {
  test("returns response data on success", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: [{ masterId: 1, languageId: 2, text: "Hello", history: [] }],
      headers: { "content-length": "50" }
    } as any);

    const result = await webPost(
      "/api/tStrings",
      {},
      { code: "ABC", tStrings: [] }
    );
    expect(result).toHaveLength(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "/api/tStrings",
      { code: "ABC", tStrings: [] }
    );
  });

  test("throws AppError on HTTP error", async () => {
    mockedAxios.post.mockRejectedValueOnce({
      request: {},
      response: { status: 500 }
    });

    await expect(
      webPost("/api/tStrings", {}, { code: "ABC", tStrings: [] })
    ).rejects.toMatchObject({ type: "HTTP", status: 500 });
  });

  test("throws AppError with type 'No Connection' when no response received", async () => {
    mockedAxios.post.mockRejectedValueOnce({ request: {}, response: null });

    await expect(
      webPost("/api/tStrings", {}, { code: "ABC", tStrings: [] })
    ).rejects.toMatchObject({ type: "No Connection" });
  });

  test("throws AppError with type 'Unknown' for unexpected errors", async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error("network failure"));

    await expect(
      webPost("/api/tStrings", {}, { code: "ABC", tStrings: [] })
    ).rejects.toMatchObject({ type: "Unknown" });
  });

  test("interpolates route params", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: [],
      headers: { "content-length": "2" }
    } as any);

    await webPost(
      "/api/languages/:languageId/tStrings" as any,
      { languageId: 3 } as any,
      { code: "ABC", tStrings: [] } as any
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "/api/languages/3/tStrings",
      expect.anything()
    );
  });

  test("uses baseUrl when provided", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: null,
      headers: { "content-length": "4" }
    } as any);

    await webPost(
      "/api/tStrings",
      {},
      { code: "ABC", tStrings: [] },
      "http://example.com"
    );
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "http://example.com/api/tStrings",
      expect.anything()
    );
  });

  test("calls log callback with POST message", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: null,
      headers: { "content-length": "4" }
    } as any);

    const mockLog = jest.fn();
    await webPost(
      "/api/tStrings",
      {},
      { code: "ABC", tStrings: [] },
      "",
      mockLog
    );
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining("POST /api/tStrings")
    );
  });
});

describe("postFile", () => {
  let mockSet: jest.Mock;

  beforeEach(() => {
    mockSet = jest.fn();
    (global as any).FormData = jest.fn(() => ({ set: mockSet }));
  });

  afterEach(() => {
    delete (global as any).FormData;
  });

  test("posts file with form data and returns response data", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { uploaded: true },
      headers: {}
    } as any);

    const mockFile = {} as File;
    const result = await postFile("/api/documents", "file", mockFile, {
      lessonId: 1
    });

    expect(result).toEqual({ uploaded: true });
    expect(mockSet).toHaveBeenCalledWith("lessonId", 1);
    expect(mockSet).toHaveBeenCalledWith("file", mockFile);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      "/api/documents",
      expect.objectContaining({ set: mockSet }),
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  });

  test("throws AppError when upload fails", async () => {
    mockedAxios.post.mockRejectedValueOnce({
      request: {},
      response: { status: 422 }
    });

    await expect(
      postFile("/api/documents", "file", {} as File, {})
    ).rejects.toMatchObject({ type: "HTTP", status: 422 });
  });

  test("throws AppError with type 'No Connection' when no response received", async () => {
    mockedAxios.post.mockRejectedValueOnce({ request: {}, response: null });

    await expect(
      postFile("/api/documents", "file", {} as File, {})
    ).rejects.toMatchObject({ type: "No Connection" });
  });

  test("throws AppError with type 'Unknown' for unexpected errors", async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error("upload failure"));

    await expect(
      postFile("/api/documents", "file", {} as File, {})
    ).rejects.toMatchObject({ type: "Unknown" });
  });

  test("calls formData.set for each key in data object", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { uploaded: true },
      headers: {}
    } as any);

    const mockFile = {} as File;
    await postFile("/api/documents", "file", mockFile, {
      lessonId: 7,
      languageId: 2,
      docType: "content"
    });

    expect(mockSet).toHaveBeenCalledWith("lessonId", 7);
    expect(mockSet).toHaveBeenCalledWith("languageId", 2);
    expect(mockSet).toHaveBeenCalledWith("docType", "content");
    expect(mockSet).toHaveBeenCalledWith("file", mockFile);
  });
});
