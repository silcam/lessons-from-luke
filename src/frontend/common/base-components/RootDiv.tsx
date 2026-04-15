import React from "react";
import styled from "styled-components";

const RootDiv = styled.div<{ children?: React.ReactNode }>`
  font-family: Helvetica, sans-serif;
  font-size: 16px;
  height: 100%;
  width: 100%;
`;

export default RootDiv;
