/// <reference types="jest" />

import { webGet, webPost } from "./WebAPIClient";

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
});
