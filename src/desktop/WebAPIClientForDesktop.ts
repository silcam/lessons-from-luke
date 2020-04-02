import { GetRoute, APIGet, APIPost, PostRoute } from "../core/interfaces/Api";
import { webGet, webPost } from "../core/api/WebAPIClient";
import { AppError, asAppError } from "../core/models/AppError";

export default class WebAPIClientForDesktop {
  private connected: boolean = false;
  private connectionCheckerTimerId: number;
  // onReconnect: Array<()=>void> = [];

  constructor() {
    this.connectionCheckerTimerId = setInterval(
      () => this.get("/api/users/current", {}),
      1000 * 3
    );
    this.get("/api/users/current", {});
  }

  setConnected() {
    this.connected = true;
    // const onReconnect = this.onReconnect;
    // this.onReconnect = [];
    // onReconnect.forEach(cb => cb())
  }

  setNotConnected() {
    this.connected = false;
    // if (cb) this.onReconnect.push(cb)
  }

  async get<T extends GetRoute>(
    route: T,
    params: APIGet[T][0]
  ): Promise<APIGet[T][1] | null> {
    return this.trackConnection(() => webGet(route, params));
  }

  async post<T extends PostRoute>(
    route: T,
    params: APIPost[T][0],
    data: APIPost[T][1]
  ): Promise<APIPost[T][2] | null> {
    return this.trackConnection(() => webPost(route, params, data));
  }

  isConnected() {
    return this.connected;
  }

  private async trackConnection<T>(cb: () => Promise<T>): Promise<T | null> {
    try {
      const result = await cb();
      this.setConnected();
      return result;
    } catch (err) {
      const error = asAppError(err);
      if (error.type == "No Connection") {
        this.setNotConnected();
        return null;
      } else {
        this.setConnected();
        throw error;
      }
    }
  }
}
