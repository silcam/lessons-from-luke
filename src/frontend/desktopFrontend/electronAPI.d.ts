interface Window {
  electronAPI: {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, callback: (...args: any[]) => void) => () => void;
  };
}
