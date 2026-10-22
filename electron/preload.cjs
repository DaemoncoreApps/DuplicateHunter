const { contextBridge, ipcRenderer } = require("electron");
const methods = new Set([
  "boot",
  "chooseFolders",
  "startScan",
  "control",
  "groups",
  "pairs",
  "analytics",
  "fileAction",
  "previewCleanup",
  "executeCleanup",
  "restore",
  "saveSettings",
  "exportReport",
  "errors",
  "drives",
  "clearHistory",
  "saveProfile",
  "deleteProfile",
  "inspectFile",
]);
contextBridge.exposeInMainWorld("hunter", {
  call: (method, payload) => {
    if (!methods.has(method))
      return Promise.reject(new Error("Unknown operation."));
    return ipcRenderer.invoke("hunter:call", method, payload).then((result) => {
      if (!result.ok) throw new Error(result.error);
      return result.value;
    });
  },
  window: (command) => {
    if (["minimize", "maximize", "close"].includes(command))
      ipcRenderer.send("hunter:window", command);
  },
  onUpdate: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on("hunter:update", handler);
    return () => ipcRenderer.removeListener("hunter:update", handler);
  },
});
