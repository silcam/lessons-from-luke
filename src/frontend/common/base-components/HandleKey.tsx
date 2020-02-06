import React, { PropsWithChildren } from "react";

interface IProps {
  [key: string]: any;
}

export default function HandleKey(props: PropsWithChildren<IProps>) {
  return (
    <div
      onKeyPress={e => {
        // console.log(`Key: ${e.key}`);
        const cb = props[`on${e.key}`];
        if (typeof cb == "function") cb();
      }}
    >
      {props.children}
    </div>
  );
}
