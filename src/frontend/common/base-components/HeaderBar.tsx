import React, { PropsWithChildren } from "react";
import styled from "styled-components";
import Colors from "../util/Colors";
import { FlexRow, FlexCol } from "./Flex";
//@ts-ignore
import logoImg from "../../../../art/logo.svg";
import Heading from "./Heading";
import { Link } from "react-router-dom";
import Banners from "../banners/Banners";
import Scroll from "./Scroll";

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
  return (
    <div>
      <HeaderBar>
        <FlexRow className="hdrFlexRow">
          {props.logoNoLink ? (
            <img src={logoImg} alt="Lessons from Luke" />
          ) : (
            <Link to="/">
              <img src={logoImg} alt="Lessons from Luke" />
            </Link>
          )}
          <Heading level={1} text={props.title} />
          <FlexCol />
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
