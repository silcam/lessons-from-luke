import React from "react";
import styled, { keyframes } from "styled-components";
import Colors from "../util/Colors";
import { useAppSelector } from "../state/appState";

const flyAcross = keyframes`
    from {
        margin-left: -33%;
    }
    to {
        margin-left: 100%;
    }
    `;

const BarContainer = styled.div`
  width: 100%;
  height: 2px;
  overflow: hidden;
`;

const Bar = styled.div`
  height: 2px;
  width: 33%;
  background-color: ${Colors.primary};
  animation: ${flyAcross} 2s linear infinite;
`;

export default function AppLoadingBar() {
  const appLoading = useAppSelector(state => state.loading);

  return <BarContainer>{appLoading > 0 && <Bar />}</BarContainer>;
}
