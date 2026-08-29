const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('featureBuilder', {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (project, projectPath) => ipcRenderer.invoke('project:save', { project, projectPath }),
  exportProject: (project) => ipcRenderer.invoke('project:export', project),
  getRecentProjects: () => ipcRenderer.invoke('project:recent'),
})
