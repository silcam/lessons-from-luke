import React from "react";
import styled, { keyframes } from "styled-components";
import Colors from "../util/Colors";

const spin = keyframes`
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
    `;

const Spinner = styled.span`
  display: inline-block;
  vertical-align: text-bottom;
  width: 1em;
  height: 1em;
  border: 2px solid ${Colors.lightGrey};
  border-top-color: ${Colors.primary};
  border-radius: 50%;
  animation: ${spin} 0.8s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/**
 * Small inline "work in progress" indicator, sized to sit beside a line of
 * text (unlike the page-scale `Loading*` components, which are JS-timer
 * driven).
 *
 * It is purely decorative — `aria-hidden`, because the text it accompanies
 * lives in a `role="status"` region that carries the meaning for assistive
 * tech. The animation is defined in a styled-components stylesheet rather
 * than an inline `style` attribute so it survives production's
 * `style-src-attr` CSP, and it stops (while staying visible) under
 * `prefers-reduced-motion`.
 */
export default function InlineSpinner() {
  return <Spinner aria-hidden="true" />;
}
