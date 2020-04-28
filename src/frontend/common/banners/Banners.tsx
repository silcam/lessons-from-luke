import React, { useState, useEffect, useContext } from "react";
import { useDispatch } from "react-redux";
import { useAppSelector } from "../state/appState";
import bannerSlice from "./bannerSlice";
import useTranslation from "../util/useTranslation";
import { AppError } from "../../../core/models/AppError";
import Button from "../base-components/Button";
import { TFunc } from "../../../core/i18n/I18n";
import styled from "styled-components";
import Colors from "../util/Colors";
import { useLocation } from "react-router-dom";
import PlatformContext from "../PlatformContext";

export default function Banners() {
  const dispatch = useDispatch();
  let banners = useAppSelector(state => state.banners);

  // Clear banners on location change
  const webContext = useContext(PlatformContext) == "web";
  if (webContext) {
    const location = useLocation();
    useEffect(() => {
      dispatch(bannerSlice.actions.reset());
    }, [location.pathname]);
  }

  return (
    <div>
      {banners.map((banner, index) => {
        switch (banner.type) {
          case "Error":
            return (
              <AppBannerError
                error={banner.error}
                close={() => dispatch(bannerSlice.actions.reset())}
                key={index}
              />
            );
        }
      })}
    </div>
  );
}

function AppBannerError(props: { error: AppError; close: () => void }) {
  const t = useTranslation();

  return (
    <ErrBanner>
      <div className="message">
        {errorMessage(t, props.error)}
        {props.error.type == "No Connection" && <Dots />}
      </div>
      {allowClose(props.error) && (
        <Button link text="X" onClick={props.close} />
      )}
    </ErrBanner>
  );
}

function errorMessage(t: TFunc, err: AppError): string {
  switch (err.type) {
    case "HTTP":
      return t("Server_error", { status: `${err.status}` });
    case "No Connection":
      return t("No_connection");
    case "Unknown":
    default:
      return t("Unknown_error");
  }
}

function allowClose(err: AppError) {
  return ["Alphachart", "HTTP", "Other", "Unknown"].includes(err.type);
}

function Dots() {
  const [dots, setDots] = useState("");
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(dots.length == 3 ? "" : dots + ".");
    }, 500);
    return () => {
      clearInterval(interval);
    };
  });
  return <div style={{ display: "inline-block", width: "2em" }}>{dots}</div>;
}

const ErrBanner = styled.div`
  background-color: ${Colors.danger};
  color: white;
  display: flex;
  flex-direction: row;
  justify-content: center;
  padding: 0.5em 0;

  button {
    color: white;
    font-weight: bold;
    margin-left: 0.7em;

    &:hover {
      color: white;
    }

    &:active {
      color: ${Colors.grey};
      outline: none;
    }
  }
`;
