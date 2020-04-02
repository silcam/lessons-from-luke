import {
  GetRoute,
  APIGet,
  APIPost,
  PostRoute
} from "../../core/interfaces/Api";
import { AppError } from "../../core/models/AppError";
import { ipcRenderer } from "electron";

export async function ipcGet<T extends GetRoute>(
  route: T,
  params: APIGet[T][0]
): Promise<APIGet[T][1]> {
  try {
    console.log(`GET ${route} ${JSON.stringify(params)}`);
    const response = await ipcRenderer.invoke(route, params);
    if (response?.data) return response.data;
    throw response?.error;
  } catch (err) {
    throwAppError(err);
  }
}

export async function ipcPost<T extends PostRoute>(
  route: T,
  params: APIPost[T][0],
  data: APIPost[T][1]
): Promise<APIPost[T][2]> {
  try {
    console.log(
      `POST ${route} ${JSON.stringify(params)} WITH ${JSON.stringify(data)}`
    );
    const response = await ipcRenderer.invoke(route, params, data);
    if (response?.data) return response.data;
    throw response?.error;
  } catch (err) {
    throwAppError(err);
  }
}

function throwAppError(err: any): never {
  let error: AppError;
  if (err.request && !err.response) error = { type: "No Connection" };
  else if (err.response && err.response.status)
    error = { type: "HTTP", status: err.response.status };
  error = { type: "Unknown" };
  throw error;
}
