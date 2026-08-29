'use strict'

const { BrowserWindow, Menu, app, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const { isProjectDirectory, readProject: readProjectFiles, validateProject, writeProject: writeProjectFiles } = require('./project-store.cjs')
const { createRecents } = require('./recents.cjs')

const isDev = !app.isPackaged
const DEV_ORIGIN = 'http://127.0.0.1:5173'

let mainWindow = null
let recents = null
let rendererHasUnsavedChanges = false
let allowClose = false

// Folders the user picked in a native dialog this session. The renderer can
// only ever ask us to write to one of these.
const grantedProjectPaths = new Set()

app.setName('FeatureBuilder')

/** IMP-09: turn filesystem errors into something a person can act on. */
function friendly(error, verb) {
  const code = error && error.code
  if (code === 'ENOENT') return `${verb}: that folder no longer exists.`
  if (code === 'EACCES' || code === 'EPERM') return `${verb}: FeatureBuilder does not have permission to use that folder.`
  if (code === 'ENOSPC') return `${verb}: the disk is full.`
  if (code === 'EROFS') return `${verb}: that location is read only.`
  if (error instanceof SyntaxError) return `${verb}: the project files are not valid JSON.`
  return `${verb}: ${error.message}`
}

function grant(projectPath) {
  const resolved = path.resolve(projectPath)
  grantedProjectPaths.add(resolved)
  return resolved
}

async function rememberOpened(projectPath) {
  await recents.remember(projectPath)
  return projectPath
}

// ---------------------------------------------------------------- window ---

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

/** BUG-17: prefix matching accepted http://127.0.0.1:5173@evil.com. */
function isAllowedNavigation(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (isDev) return parsed.origin === DEV_ORIGIN
  if (parsed.protocol !== 'file:') return false
  const distRoot = path.resolve(__dirname, '..', 'dist')
  return path.resolve(decodeURIComponent(parsed.pathname)).startsWith(distRoot + path.sep)
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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

  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`FeatureBuilder failed to load ${url}: ${code} ${description}`)
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:$/.test(safeProtocol(url))) shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault()
  })

  // IMP-03: do not let the window close over unsaved work.
  win.on('close', (event) => {
    if (allowClose || !rendererHasUnsavedChanges) return
    event.preventDefault()
    dialog
      .showMessageBox(win, {
        type: 'warning',
        buttons: ['Save and close', 'Discard changes', 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        message: 'This project has unsaved changes.',
        detail: 'Save them to the project folder before closing?',
      })
      .then(({ response }) => {
        if (response === 2) return
        if (response === 1) {
          allowClose = true
          win.close()
          return
        }
        send('menu:command', 'save-and-close')
      })
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  if (isDev) win.loadURL(DEV_ORIGIN)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

function safeProtocol(url) {
  try {
    return new URL(url).protocol
  } catch {
    return ''
  }
}

// ------------------------------------------------------------------ menu ---

/** IMP-01: the app shipped with no menu, so there were no accelerators at all. */
function buildMenu() {
  const isMac = process.platform === 'darwin'
  const command = (label, accelerator, id) => ({ label, accelerator, click: () => send('menu:command', id) })

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        command('New Project', 'CmdOrCtrl+N', 'new'),
        command('Open Project…', 'CmdOrCtrl+O', 'open'),
        { type: 'separator' },
        command('Save', 'CmdOrCtrl+S', 'save'),
        command('Save As…', 'CmdOrCtrl+Shift+S', 'save-as'),
        { type: 'separator' },
        command('Export Archive…', 'CmdOrCtrl+E', 'export-archive'),
        command('Export Specification…', 'CmdOrCtrl+Shift+E', 'export-markdown'),
        command('Export Traceability CSV…', null, 'export-csv'),
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        command('Undo', 'CmdOrCtrl+Z', 'undo'),
        command('Redo', 'CmdOrCtrl+Shift+Z', 'redo'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        command('Find Features', 'CmdOrCtrl+F', 'focus-search'),
        command('Command Palette', 'CmdOrCtrl+K', 'command-palette'),
      ],
    },
    {
      label: 'Feature',
      submenu: [
        command('New Feature', 'CmdOrCtrl+Shift+N', 'new-feature'),
        command('New Child Feature', 'CmdOrCtrl+Alt+N', 'new-child-feature'),
        command('Duplicate Feature', 'CmdOrCtrl+D', 'duplicate-feature'),
        { type: 'separator' },
        command('Delete Feature', null, 'delete-feature'),
      ],
    },
    {
      label: 'View',
      submenu: [
        command('Project Overview', 'CmdOrCtrl+0', 'view-project'),
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ------------------------------------------------------------------- ipc ---

ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Open a FeatureBuilder project' })
  if (result.canceled) return { canceled: true }
  try {
    const projectPath = grant(result.filePaths[0])
    const project = await readProjectFiles(projectPath)
    await rememberOpened(projectPath)
    return { project, projectPath }
  } catch (error) {
    return { error: friendly(error, 'Could not open that project') }
  }
})

ipcMain.handle('project:openRecent', async (_event, requestedPath) => {
  if (typeof requestedPath !== 'string') return { error: 'Could not open that project.' }
  // Only paths already in the recents list may be opened without a dialog.
  const known = await recents.read()
  if (!known.includes(requestedPath)) return { error: 'That project is no longer in your recent list.' }
  try {
    const projectPath = grant(requestedPath)
    const project = await readProjectFiles(projectPath)
    await rememberOpened(projectPath)
    return { project, projectPath }
  } catch (error) {
    await recents.forget(requestedPath)
    return { error: friendly(error, 'Could not open that project') }
  }
})

ipcMain.handle('project:save', async (_event, payload) => {
  const { project, projectPath, saveAs } = payload || {}
  let target = saveAs ? null : projectPath
  let adopt

  if (!target) {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose a folder for this project',
      buttonLabel: 'Save here',
    })
    if (result.canceled) return { canceled: true }
    target = grant(result.filePaths[0])
    adopt = await isProjectDirectory(target)
  } else {
    target = path.resolve(target)
    if (!grantedProjectPaths.has(target)) return { error: 'Choose the project folder before saving to it.' }
    adopt = true
  }

  try {
    await writeProjectFiles(target, project, { adopt })
    await rememberOpened(target)
    return { ok: true, projectPath: target }
  } catch (error) {
    return { error: friendly(error, 'Could not save the project') }
  }
})

ipcMain.handle('project:export', async (_event, project) => {
  try {
    await validateProject(project)
  } catch (error) {
    return { error: `Could not export this project: ${error.message}` }
  }
  const defaultName = `${String(project.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'project'}.featurebuilder.json`
  const result = await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: 'FeatureBuilder archive', extensions: ['json'] }] })
  if (result.canceled || !result.filePath) return { canceled: true }
  try {
    // BUG-07: this write had no error handling and the renderer reported
    // success unconditionally, including after a cancel.
    await fs.writeFile(result.filePath, JSON.stringify(project, null, 2), 'utf8')
    return { ok: true, filePath: result.filePath }
  } catch (error) {
    return { error: friendly(error, 'Could not write the archive') }
  }
})

ipcMain.handle('file:saveText', async (_event, payload) => {
  const { defaultName, contents, extension, description } = payload || {}
  if (typeof contents !== 'string') return { error: 'Nothing to export.' }
  const result = await dialog.showSaveDialog({
    defaultPath: typeof defaultName === 'string' ? defaultName : 'export.txt',
    filters: [{ name: description || 'File', extensions: [extension || 'txt'] }],
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  try {
    await fs.writeFile(result.filePath, contents, 'utf8')
    return { ok: true, filePath: result.filePath }
  } catch (error) {
    return { error: friendly(error, 'Could not write that file') }
  }
})

ipcMain.handle('project:recent', () => recents.read())
ipcMain.handle('project:forgetRecent', (_event, projectPath) => recents.forget(String(projectPath)))

ipcMain.on('window:dirty', (_event, dirty) => {
  rendererHasUnsavedChanges = Boolean(dirty)
})

ipcMain.on('window:close', () => {
  allowClose = true
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
})

// ------------------------------------------------------------- lifecycle ---

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.whenReady().then(() => {
    recents = createRecents(app.getPath('userData'))
    buildMenu()
    createWindow()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
