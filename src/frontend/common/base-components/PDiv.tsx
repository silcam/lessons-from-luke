import React from "react";
import styled from "styled-components";

interface IProps {
  bigger?: boolean;
  children?: React.ReactNode;
}

const PDiv = styled.div<IProps>`
  margin-bottom: ${props => (props.bigger ? "1.8em" : "1.2em")};
`;

export default PDiv;
