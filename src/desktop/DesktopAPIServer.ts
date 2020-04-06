import { ipcMain } from "electron";
import { GetRoute, PostRoute, APIPost, APIGet } from "../core/interfaces/Api";
import syncStateController from "./controllers/syncStateController";
import { asAppError, AppError } from "../core/models/AppError";
import { DesktopApp } from "./DesktopApp";
import languagesController from "./controllers/languagesController";
import lessonsController from "./controllers/lessonsController";
import tStringsController from "./controllers/tStringsController";

export function addGetHandler<T extends GetRoute>(
  route: T,
  handler: (params: APIGet[T][0]) => Promise<APIGet[T][1]>
) {
  ipcMain.handle(route, async (event, params) => {
    try {
      const data = await handler(params);
      return { data };
    } catch (err) {
      if (err.status) {
        const error: AppError = { type: "HTTP", status: err.status };
        return { error };
      }
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

function listen(app: DesktopApp) {
  syncStateController(app);
  languagesController(app);
  lessonsController(app);
  tStringsController(app);
}

export default {
  listen
};
