import {
  GetRoute,
  APIGet,
  Params,
  APIPost,
  PostRoute
} from "../../../core/interfaces/Api";
import Axios from "axios";
import { AppError } from "../../common/AppError/AppError";

export async function webGet<T extends GetRoute>(
  route: T,
  params: APIGet[T][0]
): Promise<APIGet[T][1] | null> {
  const finalRoute = interpolateParams(route, params);
  try {
    const response = await Axios.get(finalRoute);
    return response.data;
  } catch (err) {
    throwAppError(err);
  }
}

export async function webPost<T extends PostRoute>(
  route: T,
  params: APIPost[T][0],
  data: APIPost[T][1]
): Promise<APIPost[T][2] | null> {
  const finalRoute = interpolateParams(route, params);
  try {
    const response = await Axios.post(finalRoute, data);
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
  throw error;
}

function interpolateParams(route: string, params: Params) {
  return Object.keys(params).reduce(
    (route: string, key) => route.replace(`:${key}`, `${params[key]}`),
    route
  );
}
