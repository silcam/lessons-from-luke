import { ipcMain } from "electron";
import { LocalStorageInterface } from "./LocalStorage";
import { GetRoute, PostRoute, APIPost, APIGet } from "../core/interfaces/Api";
import syncStateController from "./controllers/syncStateController";
import WebAPIClientForDesktop from "./WebAPIClientForDesktop";
import { asAppError } from "../core/models/AppError";

export function addGetHandler<T extends GetRoute>(
  route: T,
  handler: (params: APIGet[T][0]) => Promise<APIGet[T][1]>
) {
  ipcMain.handle(route, async (event, params) => {
    try {
      const data = await handler(params);
      return { data };
    } catch (err) {
      return { error: asAppError(err) };
    }
  });
}

export function addPostHandler<T extends PostRoute>(
  route: T,
  handler: (
    params: APIPost[T][0],
    data: APIPost[T][1]
  ) => Promise<APIPost[T][2]>
) {
  ipcMain.handle(route, async (event, params, data) => {
    try {
      const responseData = await handler(params, data);
      return { data: responseData };
    } catch (err) {
      return { error: asAppError(err) };
    }
  });
}

function listen(localStorage: LocalStorageInterface) {
  const webClient = new WebAPIClientForDesktop();
  syncStateController(localStorage, webClient);
}

export default {
  listen
};
