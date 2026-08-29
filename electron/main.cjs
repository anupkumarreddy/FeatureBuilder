const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { readProject: readProjectFiles, validateProject, writeProject: writeProjectFiles } = require('./project-store.cjs')

const isDev = !app.isPackaged
const RECENTS_KEY = 'recent-projects.json'
let mainWindow = null
const grantedProjectPaths = new Set()

app.setName('FeatureBuilder')

async function readRecents() {
  try {
    return JSON.parse(await fs.readFile(path.join(app.getPath('userData'), RECENTS_KEY), 'utf8'))
  } catch { return [] }
}

async function remember(projectPath) {
  const current = await readRecents()
  const next = [projectPath, ...current.filter((item) => item !== projectPath)].slice(0, 8)
  await fs.writeFile(path.join(app.getPath('userData'), RECENTS_KEY), JSON.stringify(next, null, 2))
}

async function writeProject(projectPath, project) {
  await writeProjectFiles(projectPath, project)
  await remember(projectPath)
  return { ok: true, projectPath }
}

async function readProject(projectPath) {
  const project = await readProjectFiles(projectPath)
  await remember(projectPath)
  return { project, projectPath }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'FeatureBuilder',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f4f2ec',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  mainWindow = win
  win.once('ready-to-show', () => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    if (process.platform === 'darwin') {
      app.dock?.show()
      app.focus({ steal: true })
    }
  })
  win.webContents.on('did-fail-load', (_, code, description, url) => {
    console.error(`FeatureBuilder failed to load ${url}: ${code} ${description}`)
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:5173') : url.startsWith('file:')
    if (!allowed) event.preventDefault()
  })
  win.on('closed', () => { if (mainWindow === win) mainWindow = null })
  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Open a FeatureBuilder project' })
  if (result.canceled) return null
  try {
    const projectPath = path.resolve(result.filePaths[0])
    const opened = await readProject(projectPath)
    grantedProjectPaths.add(projectPath)
    return opened
  }
  catch (error) { return { error: `Could not open project: ${error.message}` } }
})

ipcMain.handle('project:save', async (_, { project, projectPath }) => {
  let target = projectPath
  if (!target) {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], title: 'Choose a folder for this project', buttonLabel: 'Save here' })
    if (result.canceled) return null
    target = path.resolve(result.filePaths[0])
    grantedProjectPaths.add(target)
  }
  else {
    target = path.resolve(target)
    if (!grantedProjectPaths.has(target)) return { error: 'Choose the project folder before saving to it.' }
  }
  try { return await writeProject(target, project) }
  catch (error) { return { error: `Could not save project: ${error.message}` } }
})

ipcMain.handle('project:export', async (_, project) => {
  try { validateProject(project) } catch (error) { return { error: `Could not export project: ${error.message}` } }
  const result = await dialog.showSaveDialog({ defaultPath: `${project.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.featurebuilder.json`, filters: [{ name: 'FeatureBuilder archive', extensions: ['json'] }] })
  if (result.canceled) return null
  await fs.writeFile(result.filePath, JSON.stringify(project, null, 2))
  return { ok: true, filePath: result.filePath }
})

ipcMain.handle('project:recent', readRecents)
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()
else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.whenReady().then(createWindow)
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
