import styled from "styled-components";
import { Link } from "react-router-dom";
import Colors, { darker } from "../../common/util/Colors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AppLink = styled(Link as any)`
  color: ${Colors.primary};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }

  &:active {
    color: ${darker(Colors.primary)};
  }
`;

export default AppLink;
