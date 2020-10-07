import {
  GetRoute,
  APIGet,
  Params,
  APIPost,
  PostRoute
} from "../interfaces/Api";
import Axios from "axios";
import { AppError } from "../models/AppError";

export async function webGet<T extends GetRoute>(
  route: T,
  params: APIGet[T][0],
  baseUrl: string = "",
  log: (message: string) => void = console.log
): Promise<APIGet[T][1] | null> {
  const finalRoute = interpolateParams(route, params);
  try {
    log(`GET ${finalRoute}`);
    const response = await Axios.get(baseUrl + finalRoute);
    log(`RESPONSE SIZE ${response.headers["content-length"]}`);
    return response.data;
  } catch (err) {
    throwAppError(err);
  }
}

export async function webPost<T extends PostRoute>(
  route: T,
  params: APIPost[T][0],
  data: APIPost[T][1],
  baseUrl: string = "",
  log: (message: string) => void = console.log
): Promise<APIPost[T][2] | null> {
  const finalRoute = interpolateParams(route, params);
  try {
    log(`POST ${finalRoute} ${JSON.stringify(data)}`);
    const response = await Axios.post(baseUrl + finalRoute, data);
    log(`RESPONSE SIZE ${response.headers["content-length"]}`);
    return response.data;
  } catch (err) {
    throwAppError(err);
  }
}

export async function postFile(
  route: string,
  name: string,
  file: File,
  data: { [key: string]: any }
) {
  try {
    console.log(`POST ${route}`);
    const formData = new FormData();
    Object.keys(data).forEach(key => formData.set(key, data[key]));
    formData.set(name, file);
    const response = await Axios.post(route, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data;
  } catch (err) {
    throwAppError(err);
  }
}

function throwAppError(err: any): never {
  let error: AppError;
  if (err.request && !err.response) error = { type: "No Connection" };
  else if (err.response && err.response.status)
    error = { type: "HTTP", status: err.response.status };
  else error = { type: "Unknown" };
  error.log = `${err}`;
  throw error;
}

function interpolateParams(route: string, params: Params) {
  return Object.keys(params).reduce(
    (route: string, key) => route.replace(`:${key}`, `${params[key]}`),
    route
  );
}
