import React, { PropsWithChildren, useContext } from "react";
import styled from "styled-components";
import Colors from "../util/Colors";
import { FlexRow, FlexCol } from "./Flex";
//@ts-ignore
import logoImg from "../../../../art/logo.svg";
import Heading from "./Heading";
import { Link } from "react-router-dom";
import Banners from "../banners/Banners";
import Scroll from "./Scroll";
import PlatformContext from "../PlatformContext";
import { useAppSelector } from "../state/appState";
import useTranslation from "../util/useTranslation";

const HeaderBar = styled.div`
  background-color: ${Colors.darkBG};
  color: white;
  padding: 1em;

  h1 {
    margin: 0;
  }

  div.hdrFlexRow {
    align-items: center;
  }

  img {
    height: 4em;
    margin-right: 0.8em;
  }
`;

export default HeaderBar;

interface IProps {
  title: string;
  renderRight?: () => JSX.Element | null;
  logoNoLink?: boolean;
}

export function StdHeaderBar(props: IProps) {
  const forDesktop = useContext(PlatformContext) == "desktop";

  return (
    <div>
      <HeaderBar>
        <FlexRow className="hdrFlexRow">
          {props.logoNoLink || forDesktop ? (
            <img src={logoImg} alt="Lessons from Luke" />
          ) : (
            <Link to="/">
              <img src={logoImg} alt="Lessons from Luke" />
            </Link>
          )}
          <Heading level={1} text={props.title} />
          <FlexCol />
          {forDesktop && <OfflineIndicator />}
          {props.renderRight && props.renderRight()}
        </FlexRow>
      </HeaderBar>
      <Banners />
    </div>
  );
}

export function StdHeaderBarPage(props: PropsWithChildren<IProps>) {
  const { children, ...hdrProps } = props;
  return (
    <FlexCol flexRoot>
      <StdHeaderBar {...hdrProps} />
      <Scroll>{children}</Scroll>
    </FlexCol>
  );
}

function OfflineIndicator() {
  // Only applies to Desktop
  const t = useTranslation();
  const online = useAppSelector(state => state.syncState.connected);
  return (
    <Heading
      level={4}
      style={{ color: online ? Colors.success : Colors.warning }}
      text={t(online ? "Online" : "Offline")}
    />
  );
}
