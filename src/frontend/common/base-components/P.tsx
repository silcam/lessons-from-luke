import React from "react";
import styled from "styled-components";
import Colors from "../util/Colors";

interface IProps {
  subdued?: boolean;
  children?: React.ReactNode;
}

const P = styled.p<IProps>`
  color: ${props => (props.subdued ? Colors.grey : "inherit")};
`;

export default P;
