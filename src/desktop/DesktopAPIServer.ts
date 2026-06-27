import { ipcMain } from "electron";
import {
  DesktopGetRoute,
  DesktopPostRoute,
  DesktopAPIPost,
  DesktopAPIGet,
} from "../core/api/ApiContracts";
import syncStateController from "./controllers/syncStateController";
import { asAppError, AppError } from "../core/models/AppError";
import DesktopApp from "./DesktopApp";
import languagesController from "./controllers/languagesController";
import lessonsController from "./controllers/lessonsController";
import tStringsController from "./controllers/tStringsController";

export function addGetHandler<T extends DesktopGetRoute>(
  route: T,
  handler: (params: DesktopAPIGet[T][0]) => Promise<DesktopAPIGet[T][1]>
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

export function addPostHandler<T extends DesktopPostRoute>(
  route: T,
  handler: (
    params: DesktopAPIPost[T][0],
    data: DesktopAPIPost[T][1]
  ) => Promise<DesktopAPIPost[T][2]>
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
  listen,
};
