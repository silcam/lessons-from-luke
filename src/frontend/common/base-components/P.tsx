import styled from "styled-components";
import Colors from "../util/Colors";

interface IProps {
  subdued?: boolean;
}

const P = styled.p<IProps>`
  color: ${props => (props.subdued ? Colors.grey : "inherit")};
`;

export default P;
