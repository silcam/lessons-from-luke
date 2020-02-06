import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { AppState } from "../state/appState";
import { AppBanner, ErrorBanner } from "./Banner";
import bannerSlice from "./bannerSlice";
import Alert from "../base-components/Alert";
import useTranslation from "../util/useTranslation";

export default function Banners() {
  const banners = useSelector((state: AppState) => state.banners);

  return (
    <div>
      {banners.map(banner => {
        switch (banner.type) {
          case "Hello World":
            return <Alert>Hello World!</Alert>;
          case "Error":
            return <ErrorBanner banner={banner} />;
        }
      })}
    </div>
  );
}

function ErrorBanner(props: { banner: ErrorBanner }) {
  const t = useTranslation();
  const dispatch = useDispatch();

  const removeBanner = () => dispatch(bannerSlice.actions.remove(props.banner));

  return (
    <li>
      {props.banner.message}
      {props.banner.closeable && <button onClick={removeBanner}>X</button>}
    </li>
  );
}
