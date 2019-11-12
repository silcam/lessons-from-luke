import React from "react";

export type Platform = "web" | "desktop";

const PlatformContext = React.createContext<Platform>("web");
export default PlatformContext;
