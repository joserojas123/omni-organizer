const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");
const handler = require("serve-handler");

let win;

function createWindow(url) {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Omni organizer",
  });
  win.loadURL(url);
}

// Next's static export uses absolute asset paths ("/_next/...") that don't
// resolve under file://, so the packaged app serves them over loopback HTTP
// instead of loading the exported index.html directly.
//
// The port must stay fixed across launches: localStorage (where tasks are
// saved) is scoped per origin, and a random port would put every relaunch on
// a different http://127.0.0.1:<port> origin, orphaning the previous data.
const LOCAL_PORT = 47823;

function serveStatic(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => handler(req, res, { public: dir }));
    // EADDRINUSE most likely means another instance of this app already has
    // the port; its server serves the same build, so just point at it too.
    server.on("error", () => resolve(`http://127.0.0.1:${LOCAL_PORT}`));
    server.listen(LOCAL_PORT, "127.0.0.1", () => resolve(`http://127.0.0.1:${LOCAL_PORT}`));
  });
}

app.whenReady().then(async () => {
  if (app.isPackaged) {
    const dir = path.join(process.resourcesPath, "web-out");
    const url = await serveStatic(dir);
    createWindow(url);
  } else {
    createWindow("http://localhost:3000");
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
