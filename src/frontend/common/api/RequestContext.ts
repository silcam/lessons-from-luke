import {
  GetRoute,
  APIGet,
  PostRoute,
  APIPost
} from "../../../core/interfaces/Api";
import React from "react";

export type GetRequest = <T extends GetRoute>(
  route: T,
  params: APIGet[T][0]
) => Promise<APIGet[T][1] | null>;

export type PostRequest = <T extends PostRoute>(
  route: T,
  params: APIPost[T][0],
  data: APIPost[T][1]
) => Promise<APIPost[T][2] | null>;

const RequestContext = React.createContext<{
  get: GetRequest;
  post: PostRequest;
}>({
  get: async () => null,
  post: async () => null
});

export default RequestContext;
