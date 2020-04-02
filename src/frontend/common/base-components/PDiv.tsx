import styled from "styled-components";

interface IProps {
  bigger?: boolean;
}

const PDiv = styled.div<IProps>`
  margin-bottom: ${props => (props.bigger ? "1.8em" : "1.2em")};
`;

export default PDiv;
