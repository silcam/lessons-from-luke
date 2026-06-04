const ipcRenderer = {
  on: jest.fn(),
  removeListener: jest.fn(),
  send: jest.fn(),
  invoke: jest.fn()
};

const ipcMain = {
  on: jest.fn(),
  handle: jest.fn(),
  removeHandler: jest.fn()
};

const BrowserWindow = jest.fn().mockImplementation(() => ({
  loadURL: jest.fn(),
  on: jest.fn(),
  webContents: {
    openDevTools: jest.fn(),
    on: jest.fn()
  },
  show: jest.fn(),
  close: jest.fn()
}));

const app = {
  on: jest.fn(),
  quit: jest.fn(),
  getPath: jest.fn().mockReturnValue('/tmp'),
  whenReady: jest.fn().mockResolvedValue(undefined)
};

const dialog = {
  showOpenDialog: jest.fn(),
  showSaveDialog: jest.fn()
};

const Menu = {
  buildFromTemplate: jest.fn().mockReturnValue({}),
  setApplicationMenu: jest.fn()
};

const shell = {
  openExternal: jest.fn()
};

export {
  ipcRenderer,
  ipcMain,
  BrowserWindow,
  app,
  dialog,
  Menu,
  shell
};
