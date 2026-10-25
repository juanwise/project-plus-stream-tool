// Electron entry: starts the local server and opens the control panel.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { startServer } = require('./server');

// Data (match state, custom art) lives next to the program so it is easy to find and back up.
const dataDir = app.isPackaged
  ? path.join(process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath), 'stream-tool-data')
  : path.join(__dirname, 'stream-tool-data');

async function listen() {
  for (let port = 3939; port < 3950; port++) {
    try { return await startServer({ port, dataDir }); } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error('Ports 3939-3949 are all in use.');
}

app.whenReady().then(async () => {
  const { port } = await listen();
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1180, height: 860, minWidth: 960, minHeight: 700, backgroundColor: '#04110a',
    title: 'Project Plus Stream Tool', icon: path.join(__dirname, 'assets', 'icon.png'),
  });
  win.loadURL(`http://localhost:${port}/panel/?dataDir=${encodeURIComponent(dataDir)}`);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
});

app.on('window-all-closed', () => app.quit());
