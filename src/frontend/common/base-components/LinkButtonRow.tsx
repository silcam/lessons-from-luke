import React from "react";
import styled from "styled-components";
import Button from "./Button";
import AppLink from "../../web/common/AppLink";
import Colors from "../util/Colors";

interface IProps {
  buttons: [string, (() => void) | string][];
}

export default function LinkButtonRow(props: IProps) {
  return (
    <LBRDiv>
      {props.buttons.map((button, index) => (
        <span key={index}>
          {typeof button[1] == "string" ? (
            <AppLink to={button[1]}>{button[0]}</AppLink>
          ) : (
            <Button link text={button[0]} onClick={button[1]} />
          )}
        </span>
      ))}
    </LBRDiv>
  );
}

const LBRDiv = styled.div`
  margin: 0.5em 0;

  span {
    color: ${Colors.grey};
    ::after {
      content: " | ";
    }
  }

  span:last-child {
    ::after {
      content: "";
    }
  }
`;
