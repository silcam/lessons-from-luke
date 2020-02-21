import styled from "styled-components";
import { Link } from "react-router-dom";
import Colors, { darker } from "../../common/util/Colors";

const AppLink = styled(Link)`
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
