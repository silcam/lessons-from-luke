import React, { useContext } from "react";
import PlatformContext from "../common/PlatformContext";
import {
  Params,
  GetRoute,
  APIGet,
  PostRoute,
  APIPost
} from "../../core/api/Api";

export type GetRequest = <T extends GetRoute>(
  route: T,
  params: APIGet[T][0]
) => Promise<APIGet[T][1] | null>;
export type PostRequest = <T extends PostRoute>(
  route: T,
  params: APIPost[T][0],
  data: APIPost[T][1]
) => Promise<APIPost[T][2] | null>;

// async function axiosGet<T extends keyof CoreAPIGet>(
//   route: T,
//   params: Params = {}
// ): Promise<ReturnType<CoreAPIGet[T]>> {
//   const response = await Axios.get(route, params);
//   return response.data;
// }

interface IAPIContext {
  get: GetRequest;
  post: PostRequest;
}

export const APIContext = React.createContext<IAPIContext>({
  get: async () => null,
  post: async () => null
});

export default function useAPI() {
  return useContext(APIContext);
}
