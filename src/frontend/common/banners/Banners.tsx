import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { AppState } from "../state/appState";
import { useTranslation } from "../state/currentUserSlice";
import { AppBanner, ErrorBanner } from "./Banner";
import bannerSlice from "./bannerSlice";

export default function Banners() {
  const banners = useSelector((state: AppState) => state.banners);

  return (
    <ul>
      {banners.map(banner => {
        switch (banner.type) {
          case "Hello World":
            return <li>Hello World!</li>;
          case "Error":
            return <ErrorBanner banner={banner} />;
        }
      })}
    </ul>
  );
}

function ErrorBanner(props: { banner: ErrorBanner }) {
  const t = useTranslation();
  const dispatch = useDispatch();

  const removeBanner = () => dispatch(bannerSlice.actions.remove(props.banner));

  return (
    <li>
      {t(props.banner.message, { status: props.banner.status })}
      {props.banner.closeable && <button onClick={removeBanner}>X</button>}
    </li>
  );
}
