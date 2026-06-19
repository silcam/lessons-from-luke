import styled from "styled-components";

/**
 * Small, secondary guidance text under form fields and in confirmation flows.
 * Uses ink (inherited body color), not Mute Grey — helper text must still clear
 * WCAG AA, and grey (#999) does not on white.
 */
const HelpText = styled.p`
  font-size: 0.85em;
  margin: 0.25em 0 0;
  color: inherit;
`;

export default HelpText;
