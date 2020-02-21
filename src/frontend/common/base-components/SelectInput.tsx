import React from "react";
import styled from "styled-components";

interface IProps {
  value: string;
  setValue: (v: string) => void;
  options: [string, string][];
}
type Options = IProps["options"];

export default function SelectInput(props: IProps) {
  return (
    <StyledSelect
      value={props.value}
      onChange={e => props.setValue(e.target.value)}
    >
      {props.options.map(option => (
        <option key={option[0]} value={option[0]}>
          {option[1]}
        </option>
      ))}
    </StyledSelect>
  );
}

export function optionsDisplayIsKey(options: readonly string[]): Options {
  return options.map(opt => [opt, opt]);
}

// export function optionsTranslated(options: TKey)

const StyledSelect = styled.select`
  font-size: 1em;
`;
