import { GetRoute, APIGet, APIPost, PostRoute } from "../core/interfaces/Api";
import { webGet, webPost } from "../core/api/WebAPIClient";
import { AppError, asAppError } from "../core/models/AppError";

export default class WebAPIClientForDesktop {
  private connected: boolean = false;
  private connectionCheckerTimerId: number;
  private onConnectionChangeListeners: Array<(connected: boolean) => void> = [];

  constructor() {
    this.connectionCheckerTimerId = setInterval(
      () => this.get("/api/users/current", {}).catch(err => console.error(err)),
      1000 * 3
    );
    this.get("/api/users/current", {}).catch(err => console.error(err));
  }

  setConnected(connected: boolean) {
    if (connected !== this.connected) {
      this.connected = connected;
      this.onConnectionChangeListeners.forEach(cb => cb(connected));
    }
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

  onConnectionChange(cb: (connected: boolean) => void) {
    this.onConnectionChangeListeners.push(cb);
  }

  removeOnConnectionChangeListener(cb: (connected: boolean) => void) {
    this.onConnectionChangeListeners = this.onConnectionChangeListeners.filter(
      listener => listener !== cb
    );
  }

  private async trackConnection<T>(cb: () => Promise<T>): Promise<T | null> {
    try {
      const result = await cb();
      this.setConnected(true);
      return result;
    } catch (err) {
      const error = asAppError(err);
      if (error.type == "No Connection") {
        this.setConnected(false);
        return null;
      } else {
        this.setConnected(true);
        throw error;
      }
    }
  }
}
