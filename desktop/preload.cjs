const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hermesDesktop", {
  isDesktop: true,
  openFloating: () => ipcRenderer.invoke("floating:open"),
  closeFloating: () => ipcRenderer.invoke("floating:close"),
  focusMain: () => ipcRenderer.invoke("floating:focus-main"),
  resizeFloating: (height) => ipcRenderer.invoke("floating:resize", height),
  dragFloatingStart: (x, y) =>
    ipcRenderer.send("floating:drag-start", { x, y }),
  dragFloatingMove: (x, y) =>
    ipcRenderer.send("floating:drag-move", { x, y }),
  dragFloatingEnd: () => ipcRenderer.send("floating:drag-end"),
});
