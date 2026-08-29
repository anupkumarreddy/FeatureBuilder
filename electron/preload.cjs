'use strict'

const { contextBridge, ipcRenderer } = require('electron')

const MENU_CHANNEL = 'menu:command'

contextBridge.exposeInMainWorld('featureBuilder', {
  openProject: () => ipcRenderer.invoke('project:open'),
  openRecentProject: (projectPath) => ipcRenderer.invoke('project:openRecent', projectPath),
  saveProject: (project, projectPath, options) =>
    ipcRenderer.invoke('project:save', { project, projectPath, saveAs: Boolean(options && options.saveAs) }),
  exportProject: (project) => ipcRenderer.invoke('project:export', project),
  saveTextFile: (payload) => ipcRenderer.invoke('file:saveText', payload),
  getRecentProjects: () => ipcRenderer.invoke('project:recent'),
  forgetRecentProject: (projectPath) => ipcRenderer.invoke('project:forgetRecent', projectPath),
  setUnsavedChanges: (dirty) => ipcRenderer.send('window:dirty', Boolean(dirty)),
  closeWindow: () => ipcRenderer.send('window:close'),
  onMenuCommand: (handler) => {
    // Forward only the command id; never hand the renderer the IpcRendererEvent.
    const listener = (_event, command) => handler(String(command))
    ipcRenderer.on(MENU_CHANNEL, listener)
    return () => ipcRenderer.removeListener(MENU_CHANNEL, listener)
  },
})
