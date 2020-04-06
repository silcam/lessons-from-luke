import {
  GetRoute,
  APIGet,
  APIPost,
  PostRoute
} from "../../core/interfaces/Api";
import { asAppError } from "../../core/models/AppError";
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
    throw asAppError(err);
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
    throw asAppError(err);
  }
}
