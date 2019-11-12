import {
  GetRoute,
  APIGet,
  Params,
  APIPost,
  PostRoute
} from "../../../core/api/Api";
import Axios from "axios";

async function webGet<T extends GetRoute>(
  route: T,
  params: APIGet[T][0]
): Promise<APIGet[T][1] | null> {
  const finalRoute = interpolateParams(route, params);
  const response = await Axios.get(finalRoute);
  return response.data;
}

async function webPost<T extends PostRoute>(
  route: T,
  params: APIPost[T][0],
  data: APIPost[T][1]
): Promise<APIPost[T][2] | null> {
  const finalRoute = interpolateParams(route, params);
  const response = await Axios.post(finalRoute, data);
  return response.data;
}

function interpolateParams(route: string, params: Params) {
  return Object.keys(params).reduce(
    (route: string, key) => route.replace(`:${key}`, params[key]),
    route
  );
}

const WebAPI = {
  get: webGet,
  post: webPost
};

export default WebAPI;
