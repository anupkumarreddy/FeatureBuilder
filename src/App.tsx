import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, Clock, FileDown, FilePlus2, FolderOpen,
  GitBranch, LayoutDashboard, Plus, Redo2, Save, Search, Sparkles, Trash2, Undo2,
} from 'lucide-react'
import type { DialogRequest } from './components/Dialog'
import { Dialog } from './components/Dialog'
import { CommandPalette, type Command } from './components/CommandPalette'
import { FeatureTree } from './components/FeatureTree'
import { ProjectOverview } from './components/ProjectOverview'
import { Design } from './components/tabs/Design'
import { EmptyState } from './components/tabs/shared'
import { Overview } from './components/tabs/Overview'
import { Requirements } from './components/tabs/Requirements'
import { Traceability } from './components/tabs/Traceability'
import { Verification } from './components/tabs/Verification'
import { useHistory } from './history'
import { clearLocalMirror, readLocalMirror, useAutosave, useLocalMirror, useUnsavedChangesGuard } from './hooks/useProjectPersistence'
import { traceabilityToCsv } from './export/csv'
import { projectToMarkdown } from './export/markdown'
import {
  createFeature, descendants, duplicateFeature, moveFeature, normalizeOrder, parseProject,
  readiness, statusLabel, uid, validateProject,
} from './model'
import type { DropPosition } from './model'
import { sampleProject } from './sample'
import type { Feature, IssueField, Project, StageStatus } from './types'

type Tab = IssueField
type View = 'project' | 'feature'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'requirements', label: 'Requirements' },
  { id: 'design', label: 'Design spec' },
  { id: 'verification', label: 'DV plan' },
  { id: 'traceability', label: 'Traceability' },
]
const STATUS_OPTIONS: StageStatus[] = ['not-started', 'draft', 'in-review', 'approved', 'in-progress', 'complete', 'blocked']
const PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,15}$/

function freshProject(name = 'Untitled project', prefix = 'FEAT'): Project {
  const now = new Date().toISOString()
  return { schemaVersion: 1, id: uid(), name, description: '', prefix, createdAt: now, updatedAt: now, features: [] }
}

function cloneSample(): Project {
  const now = new Date().toISOString()
  return structuredClone({ ...sampleProject, id: uid(), createdAt: now, updatedAt: now })
}

/** BUG-06: an imported or mirrored project used to reach state unvalidated. */
function restoreInitialProject(): Project {
  try {
    const mirrored = readLocalMirror()
    if (mirrored) return parseProject(mirrored)
  } catch {
    clearLocalMirror()
  }
  return cloneSample()
}

function rootIdsOf(project: Project) {
  return new Set(project.features.filter((feature) => feature.parentId === null).map((feature) => feature.id))
}

function StatusSelect({ value, onChange, label }: { value: StageStatus; onChange: (status: StageStatus) => void; label: string }) {
  return (
    <select
      className={`status-select status-${value}`}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value as StageStatus)}
    >
      {STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {statusLabel(status)}
        </option>
      ))}
    </select>
  )
}

export default function App() {
  const history = useHistory<Project>(restoreInitialProject)
  const project = history.value

  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>(() => project.features[0]?.id ?? '')
  const [view, setView] = useState<View>(() => (project.features.length ? 'feature' : 'project'))
  const [expanded, setExpanded] = useState<Set<string>>(() => rootIdsOf(project))
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'error' } | null>(null)
  const [showIssues, setShowIssues] = useState(false)
  const [recents, setRecents] = useState<string[]>([])
  const [showRecents, setShowRecents] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [dialog, setDialog] = useState<{ request: DialogRequest; resolve: (value: string | boolean | null) => void } | null>(null)

  const importRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  // BUG-14: this used to fall back to features[0], so edits silently landed on
  // a feature the user had not chosen. An unresolved id now shows the project.
  const selected = useMemo(
    () => project.features.find((feature) => feature.id === selectedId) ?? null,
    [project.features, selectedId],
  )
  const issues = useMemo(() => validateProject(project), [project])
  const featureIssues = useMemo(
    () => (selected ? issues.filter((issue) => issue.featureId === selected.id) : []),
    [issues, selected],
  )
  const effectiveView: View = view === 'feature' && selected ? 'feature' : 'project'

  const mirrorFailed = useLocalMirror(project, true)
  useUnsavedChangesGuard(dirty)

  const flash = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    window.clearTimeout(toastTimer.current)
    setToast({ message, tone })
    toastTimer.current = window.setTimeout(() => setToast(null), tone === 'error' ? 6000 : 2400)
  }, [])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const ask = useCallback(
    (request: DialogRequest) =>
      new Promise<string | boolean | null>((resolve) => {
        setDialog({ request, resolve })
      }),
    [],
  )
  const resolveDialog = useCallback(
    (value: string | boolean | null) => {
      setDialog((current) => {
        current?.resolve(value)
        return null
      })
    },
    [],
  )

  const commit = useCallback(
    (updater: (current: Project) => Project, coalesce?: string) => {
      history.commit((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }), { coalesce })
      setDirty(true)
    },
    [history],
  )

  const updateFeature = useCallback(
    (featureId: string, patch: Partial<Feature>, coalesce?: string) => {
      commit(
        (current) => ({
          ...current,
          features: current.features.map((feature) =>
            feature.id === featureId ? { ...feature, ...patch, updatedAt: new Date().toISOString() } : feature,
          ),
        }),
        coalesce,
      )
    },
    [commit],
  )

  const updateSelected = useCallback(
    (patch: Partial<Feature>, coalesce?: string) => {
      if (selected) updateFeature(selected.id, patch, coalesce)
    },
    [selected, updateFeature],
  )

  const replaceSelected = useCallback(
    (next: Feature) => {
      if (!selected) return
      commit((current) => ({
        ...current,
        features: current.features.map((feature) =>
          feature.id === next.id ? { ...next, updatedAt: new Date().toISOString() } : feature,
        ),
      }))
    },
    [commit, selected],
  )

  // ------------------------------------------------------------ project io --

  const loadProject = useCallback(
    (next: Project, path: string | null, message: string) => {
      history.reset(next)
      setProjectPath(path)
      const first = next.features[0]?.id ?? ''
      setSelectedId(first)
      setView(first ? 'feature' : 'project')
      // BUG-09: `expanded` kept the previous project's ids, so a freshly opened
      // project rendered as a flat, seemingly empty tree.
      setExpanded(rootIdsOf(next))
      setTab('overview')
      setQuery('')
      setDirty(false)
      flash(message)
    },
    [flash, history],
  )

  const refreshRecents = useCallback(async () => {
    const api = window.featureBuilder
    if (!api) return
    try {
      setRecents(await api.getRecentProjects())
    } catch {
      setRecents([])
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    window.featureBuilder
      ?.getRecentProjects()
      .then((list) => {
        if (!cancelled) setRecents(list)
      })
      .catch(() => {
        if (!cancelled) setRecents([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const save = useCallback(
    async (options: { saveAs?: boolean; thenClose?: boolean } = {}) => {
      const api = window.featureBuilder
      if (!api) {
        try {
          window.localStorage.setItem('featurebuilder-project', JSON.stringify(project))
          setDirty(false)
          flash('Saved in browser storage')
        } catch {
          flash('Browser storage is full. Export an archive instead.', 'error')
        }
        return
      }
      const result = await api.saveProject(project, options.saveAs ? null : projectPath, { saveAs: options.saveAs })
      if (result?.canceled) return
      if (result?.error) return flash(result.error, 'error')
      if (result?.ok) {
        setProjectPath(result.projectPath ?? projectPath)
        setDirty(false)
        void refreshRecents()
        flash('Project saved')
        if (options.thenClose) api.closeWindow()
      }
    },
    [flash, project, projectPath, refreshRecents],
  )

  const confirmDiscard = useCallback(async () => {
    if (!dirty) return true
    const answer = await ask({
      kind: 'confirm',
      title: 'Discard unsaved changes?',
      body: 'This project has changes that are not written to the project folder yet.',
      confirmLabel: 'Discard',
      destructive: true,
    })
    return answer === true
  }, [ask, dirty])

  const open = useCallback(async () => {
    if (!(await confirmDiscard())) return
    const api = window.featureBuilder
    if (!api) return importRef.current?.click()
    const result = await api.openProject()
    if (result?.canceled) return
    if (result?.error) return flash(result.error, 'error')
    if (result?.project) {
      loadProject(result.project, result.projectPath ?? null, 'Project opened')
      void refreshRecents()
    }
  }, [confirmDiscard, flash, loadProject, refreshRecents])

  const openRecent = useCallback(
    async (path: string) => {
      if (!(await confirmDiscard())) return
      setShowRecents(false)
      const result = await window.featureBuilder?.openRecentProject(path)
      if (!result || result.canceled) return
      if (result.error) {
        void refreshRecents()
        return flash(result.error, 'error')
      }
      if (result.project) {
        loadProject(result.project, result.projectPath ?? null, 'Project opened')
        void refreshRecents()
      }
    },
    [confirmDiscard, flash, loadProject, refreshRecents],
  )

  const importJson = useCallback(
    (file?: File) => {
      if (!file) return
      const reader = new FileReader()
      reader.onerror = () => flash('That file could not be read.', 'error')
      reader.onload = () => {
        try {
          // BUG-06: this used to setProject() straight from JSON.parse, so any
          // well-formed file with the wrong shape threw during render.
          const loaded = parseProject(JSON.parse(String(reader.result)))
          loadProject(loaded, null, 'Project imported')
        } catch (error) {
          flash(error instanceof Error ? `That file is not a valid project: ${error.message}` : 'That file is not a valid project.', 'error')
        }
      }
      reader.readAsText(file)
    },
    [flash, loadProject],
  )

  const exportArchive = useCallback(async () => {
    const api = window.featureBuilder
    if (api) {
      const result = await api.exportProject(project)
      // BUG-07: success was reported unconditionally, cancel included.
      if (result?.canceled) return
      if (result?.error) return flash(result.error, 'error')
      return flash('Archive exported')
    }
    downloadInBrowser(`${safeFilename(project.name)}.featurebuilder.json`, JSON.stringify(project, null, 2), 'application/json')
    flash('Archive downloaded')
  }, [flash, project])

  const exportText = useCallback(
    async (kind: 'markdown' | 'csv') => {
      const isMarkdown = kind === 'markdown'
      const contents = isMarkdown ? projectToMarkdown(project) : traceabilityToCsv(project)
      const extension = isMarkdown ? 'md' : 'csv'
      const defaultName = `${safeFilename(project.name)}${isMarkdown ? '-specification' : '-traceability'}.${extension}`
      const api = window.featureBuilder
      if (api) {
        const result = await api.saveTextFile({
          defaultName,
          contents,
          extension,
          description: isMarkdown ? 'Markdown specification' : 'Traceability matrix',
        })
        if (result?.canceled) return
        if (result?.error) return flash(result.error, 'error')
        return flash(isMarkdown ? 'Specification exported' : 'Traceability matrix exported')
      }
      downloadInBrowser(defaultName, contents, isMarkdown ? 'text/markdown' : 'text/csv')
      flash('Export downloaded')
    },
    [flash, project],
  )

  const newProject = useCallback(async () => {
    if (!(await confirmDiscard())) return
    const name = await ask({
      kind: 'prompt',
      title: 'New project',
      label: 'Project name',
      initialValue: 'Untitled project',
      confirmLabel: 'Create',
      validate: (value) => (value ? null : 'Give the project a name.'),
    })
    if (typeof name !== 'string') return
    loadProject(freshProject(name), null, 'New project created')
    setDirty(true)
  }, [ask, confirmDiscard, loadProject])

  /** BUG-01: this ran through window.prompt(), which Electron does not support. */
  const renameProject = useCallback(async () => {
    const name = await ask({
      kind: 'prompt',
      title: 'Rename project',
      label: 'Project name',
      initialValue: project.name,
      validate: (value) => (value ? null : 'Give the project a name.'),
    })
    if (typeof name !== 'string' || name === project.name) return
    commit((current) => ({ ...current, name }))
  }, [ask, commit, project.name])

  const editPrefix = useCallback(async () => {
    const prefix = await ask({
      kind: 'prompt',
      title: 'Feature key prefix',
      label: 'Prefix',
      initialValue: project.prefix,
      placeholder: 'AUR',
      validate: (value) => (PREFIX_PATTERN.test(value) ? null : 'Use 1-16 letters or digits, starting with a letter.'),
    })
    if (typeof prefix !== 'string' || prefix === project.prefix) return
    commit((current) => ({ ...current, prefix }))
  }, [ask, commit, project.prefix])

  // ------------------------------------------------------------- features --

  const addFeature = useCallback(
    (parentId: string | null) => {
      const id = uid()
      // BUG-10: the key and order used to be derived from the render-scope
      // project, so two adds before a re-render produced the same key.
      commit((current) => {
        const created = { ...createFeature(current, parentId), id }
        return { ...current, features: [...current.features, created] }
      })
      if (parentId) setExpanded((current) => new Set(current).add(parentId))
      setSelectedId(id)
      setView('feature')
      setTab('overview')
    },
    [commit],
  )

  const deleteFeature = useCallback(async () => {
    if (!selected) return
    const removedIds = [selected.id, ...descendants(project.features, selected.id)]
    const confirmed = await ask({
      kind: 'confirm',
      title: `Delete ${selected.key}?`,
      body:
        removedIds.length > 1
          ? `This also deletes ${removedIds.length - 1} child ${removedIds.length === 2 ? 'feature' : 'features'}. You can undo this.`
          : 'You can undo this.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (confirmed !== true) return

    commit((current) => {
      const removed = new Set([selected.id, ...descendants(current.features, selected.id)])
      const remaining = current.features
        .filter((feature) => !removed.has(feature.id))
        .map((feature) =>
          feature.dependencies.some((id) => removed.has(id))
            ? { ...feature, dependencies: feature.dependencies.filter((id) => !removed.has(id)) }
            : feature,
        )
      return { ...current, features: normalizeOrder(remaining) }
    })
    setSelectedId('')
    setView('project')
  }, [ask, commit, project.features, selected])

  const duplicateSelected = useCallback(() => {
    if (!selected) return
    let createdId = ''
    commit((current) => {
      const copies = duplicateFeature(current, selected.id)
      createdId = copies[0]?.id ?? ''
      return { ...current, features: [...current.features, ...copies] }
    })
    if (createdId) {
      setSelectedId(createdId)
      setView('feature')
    }
  }, [commit, selected])

  const handleMove = useCallback(
    (id: string, targetId: string | null, position: DropPosition) => {
      commit((current) => ({ ...current, features: moveFeature(current.features, id, targetId, position) }))
      if (position === 'inside' && targetId) setExpanded((current) => new Set(current).add(targetId))
    },
    [commit],
  )

  const selectFeature = useCallback((id: string) => {
    setSelectedId(id)
    setView('feature')
  }, [])

  // ------------------------------------------------------------- commands --

  const commands = useMemo<Command[]>(() => {
    const featureCommands: Command[] = project.features.map((feature) => ({
      id: `feature:${feature.id}`,
      group: 'Feature',
      label: `${feature.key} · ${feature.title}`,
      hint: feature.owner || undefined,
      run: () => selectFeature(feature.id),
    }))
    const actions: Command[] = [
      { id: 'project:overview', group: 'View', label: 'Project overview', run: () => setView('project') },
      { id: 'project:new', group: 'Project', label: 'New project', run: () => void newProject() },
      { id: 'project:open', group: 'Project', label: 'Open project', run: () => void open() },
      { id: 'project:save', group: 'Project', label: 'Save project', run: () => void save() },
      { id: 'project:saveAs', group: 'Project', label: 'Save project as…', run: () => void save({ saveAs: true }) },
      { id: 'project:rename', group: 'Project', label: 'Rename project', run: () => void renameProject() },
      { id: 'project:prefix', group: 'Project', label: 'Change feature key prefix', run: () => void editPrefix() },
      { id: 'export:archive', group: 'Export', label: 'Export archive (JSON)', run: () => void exportArchive() },
      { id: 'export:markdown', group: 'Export', label: 'Export specification (Markdown)', run: () => void exportText('markdown') },
      { id: 'export:csv', group: 'Export', label: 'Export traceability matrix (CSV)', run: () => void exportText('csv') },
      { id: 'feature:new', group: 'Feature', label: 'New top-level feature', run: () => addFeature(null) },
    ]
    const selectedActions: Command[] = selected
      ? [
          { id: 'feature:child', group: 'Feature', label: `Add child of ${selected.key}`, run: () => addFeature(selected.id) },
          { id: 'feature:duplicate', group: 'Feature', label: `Duplicate ${selected.key}`, run: () => duplicateSelected() },
          { id: 'feature:delete', group: 'Feature', label: `Delete ${selected.key}`, run: () => void deleteFeature() },
        ]
      : []
    return [...actions, ...selectedActions, ...featureCommands]
  }, [
    addFeature, deleteFeature, duplicateSelected, editPrefix, exportArchive, exportText,
    newProject, open, project.features, renameProject, save, selectFeature, selected,
  ])

  const runCommand = useCallback(
    (command: string) => {
      switch (command) {
        case 'new': return void newProject()
        case 'open': return void open()
        case 'save': return void save()
        case 'save-as': return void save({ saveAs: true })
        case 'save-and-close': return void save({ thenClose: true })
        case 'export-archive': return void exportArchive()
        case 'export-markdown': return void exportText('markdown')
        case 'export-csv': return void exportText('csv')
        case 'undo': return history.undo()
        case 'redo': return history.redo()
        case 'command-palette': return setPaletteOpen(true)
        case 'focus-search': return searchRef.current?.focus()
        case 'new-feature': return addFeature(null)
        case 'new-child-feature': return addFeature(selected?.id ?? null)
        case 'duplicate-feature': return duplicateSelected()
        case 'delete-feature': return void deleteFeature()
        case 'view-project': return setView('project')
        default: return undefined
      }
    },
    [addFeature, deleteFeature, duplicateSelected, exportArchive, exportText, history, newProject, open, save, selected],
  )

  useEffect(() => window.featureBuilder?.onMenuCommand(runCommand), [runCommand])

  // Browser builds have no menu, so the same shortcuts are bound here.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return
      const key = event.key.toLowerCase()
      const map: Record<string, string> = { k: 'command-palette', s: event.shiftKey ? 'save-as' : 'save', o: 'open', f: 'focus-search' }
      if (key === 'z') {
        event.preventDefault()
        return runCommand(event.shiftKey ? 'redo' : 'undo')
      }
      const command = map[key]
      if (!command) return
      event.preventDefault()
      runCommand(command)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [runCommand])

  useAutosave({
    project,
    projectPath,
    dirty,
    onSaved: () => setDirty(false),
    onError: (message) => flash(message, 'error'),
  })

  const score = selected ? readiness(selected) : 0

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="traffic-space" />
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <GitBranch size={18} />
          </div>
          <div>
            <strong>FeatureBuilder</strong>
            <span>SPEC WORKSPACE</span>
          </div>
        </div>

        <div className="project-row">
          <button className="project-card" type="button" title="Rename project" onClick={() => void renameProject()}>
            <span className="project-avatar" aria-hidden="true">
              {project.name.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{project.name}</strong>
              <small>
                {project.features.length} features · {project.prefix}
              </small>
            </span>
          </button>
          {recents.length > 0 && (
            <div className="recents">
              <button
                type="button"
                className="icon-button"
                aria-expanded={showRecents}
                aria-label="Recent projects"
                title="Recent projects"
                onClick={() => setShowRecents((value) => !value)}
              >
                <Clock size={16} />
              </button>
              {showRecents && (
                <div className="recents-menu" role="menu">
                  <p>Recent projects</p>
                  {recents.map((path) => (
                    <button key={path} type="button" role="menuitem" title={path} onClick={() => void openRecent(path)}>
                      <strong>{path.split(/[/\\]/).filter(Boolean).at(-1)}</strong>
                      <small>{path}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchRef}
            aria-label="Search features"
            placeholder="Search features"
            value={query}
            onChange={(event) => setQuery(event.target.value.toLowerCase())}
          />
          <button type="button" className="kbd-button" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
            ⌘K
          </button>
        </div>

        <div className="tree-heading">
          <button type="button" className={`view-link ${effectiveView === 'project' ? 'active' : ''}`} onClick={() => setView('project')}>
            <LayoutDashboard size={14} aria-hidden="true" />
            Project overview
          </button>
          <button aria-label="Add root feature" title="Add root feature" type="button" onClick={() => addFeature(null)}>
            <Plus size={16} />
          </button>
        </div>

        <div
          className="tree-scroll"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            if (event.target !== event.currentTarget) return
            const dragged = event.dataTransfer.getData('text/feature-id')
            if (dragged) handleMove(dragged, null, 'inside')
          }}
        >
          {project.features.length ? (
            <FeatureTree
              features={project.features}
              selectedId={effectiveView === 'feature' ? selectedId : ''}
              expanded={expanded}
              query={query}
              onSelect={selectFeature}
              onToggle={(id) =>
                setExpanded((current) => {
                  const next = new Set(current)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })
              }
              onMove={handleMove}
            />
          ) : (
            <div className="sidebar-empty">
              No features yet.
              <button type="button" onClick={() => addFeature(null)}>
                Create the first one
              </button>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <button type="button" onClick={() => void newProject()}>
            <FilePlus2 size={16} aria-hidden="true" />
            New
          </button>
          <button type="button" onClick={() => void open()}>
            <FolderOpen size={16} aria-hidden="true" />
            Open
          </button>
          <button type="button" onClick={() => void save()}>
            <Save size={16} aria-hidden="true" />
            Save
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button type="button" className="linkish" onClick={() => setView('project')}>
              {project.name}
            </button>
            {effectiveView === 'feature' && selected && (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <strong>{selected.key}</strong>
              </>
            )}
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="icon-button"
              title="Undo"
              aria-label="Undo"
              disabled={!history.canUndo}
              onClick={history.undo}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              className="icon-button"
              title="Redo"
              aria-label="Redo"
              disabled={!history.canRedo}
              onClick={history.redo}
            >
              <Redo2 size={16} />
            </button>
            {mirrorFailed && (
              <span className="save-state dirty" title="Browser backup is unavailable for a project this large. Save to a project folder.">
                <AlertTriangle size={13} aria-hidden="true" />
                Backup off
              </span>
            )}
            <span className={`save-state ${dirty ? 'dirty' : ''}`} role="status">
              {dirty ? (
                'Unsaved changes'
              ) : (
                <>
                  <Check size={13} aria-hidden="true" />
                  Saved
                </>
              )}
            </span>
            <button className="icon-button" type="button" title="Export archive" aria-label="Export archive" onClick={() => void exportArchive()}>
              <FileDown size={17} />
            </button>
            <button className="primary-button" type="button" onClick={() => void save()}>
              <Save size={15} aria-hidden="true" />
              Save project
            </button>
          </div>
        </header>

        {effectiveView === 'project' ? (
          project.features.length === 0 && !project.name ? (
            <EmptyState
              icon={<Sparkles size={30} />}
              title="Start with a feature"
              text="Build a structured specification by adding the first top-level feature."
              action={
                <button className="primary-button" type="button" onClick={() => addFeature(null)}>
                  <Plus size={16} aria-hidden="true" />
                  Add first feature
                </button>
              }
            />
          ) : (
            <div className="content-wrap single">
              <section className="editor">
                <ProjectOverview project={project} issues={issues} onSelect={selectFeature} />
              </section>
            </div>
          )
        ) : (
          selected && (
            <>
              <section className="feature-header">
                <div className="eyebrow">
                  <span>{selected.key}</span>
                  <span className={`priority priority-${selected.priority.toLowerCase()}`}>{selected.priority}</span>
                </div>
                <div className="title-row">
                  <input
                    className="title-input"
                    aria-label="Feature title"
                    value={selected.title}
                    onChange={(event) => updateSelected({ title: event.target.value }, `title:${selected.id}`)}
                  />
                  <div className="header-actions">
                    <button type="button" title="Add child feature" onClick={() => addFeature(selected.id)}>
                      <Plus size={16} aria-hidden="true" />
                      Child feature
                    </button>
                    <button type="button" title="Duplicate feature" onClick={duplicateSelected}>
                      Duplicate
                    </button>
                    <button className="danger-ghost" type="button" title="Delete feature" aria-label={`Delete ${selected.key}`} onClick={() => void deleteFeature()}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <nav className="tabs" aria-label="Feature sections">
                  {TABS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={tab === item.id}
                      className={tab === item.id ? 'active' : ''}
                      onClick={() => setTab(item.id)}
                    >
                      {item.label}
                      {item.id === 'traceability' && <span className="tab-count">{selected.requirements.length}</span>}
                    </button>
                  ))}
                </nav>
              </section>

              <div className="content-wrap">
                <section className="editor">
                  {tab === 'overview' && <Overview feature={selected} features={project.features} update={updateSelected} />}
                  {tab === 'requirements' && <Requirements feature={selected} update={updateSelected} replace={replaceSelected} />}
                  {tab === 'design' && <Design feature={selected} update={updateSelected} />}
                  {tab === 'verification' && <Verification feature={selected} update={updateSelected} />}
                  {tab === 'traceability' && <Traceability feature={selected} />}
                </section>

                <aside className="inspector" aria-label="Feature readiness">
                  <div className="inspector-title">
                    <span>READINESS</span>
                    <strong>{score}%</strong>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${score}%` }} />
                  </div>
                  <p>{featureIssues.length ? `${featureIssues.length} items need attention before review.` : 'This feature is ready for review.'}</p>

                  <div className="status-stack">
                    {(['specification', 'design', 'dv'] as const).map((key) => (
                      <div key={key}>
                        <label htmlFor={`status-${key}`}>{key === 'dv' ? 'DV plan' : key}</label>
                        <span id={`status-${key}`}>
                          <StatusSelect
                            label={`${key === 'dv' ? 'DV plan' : key} status`}
                            value={selected.statuses[key]}
                            onChange={(status) => updateSelected({ statuses: { ...selected.statuses, [key]: status } })}
                          />
                        </span>
                      </div>
                    ))}
                  </div>

                  <button className="issues-button" type="button" aria-expanded={showIssues} onClick={() => setShowIssues((value) => !value)}>
                    <AlertTriangle size={16} aria-hidden="true" />
                    <span>
                      {featureIssues.length} validation {featureIssues.length === 1 ? 'issue' : 'issues'}
                    </span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>
                  {showIssues && featureIssues.length > 0 && (
                    <div className="issue-list">
                      {featureIssues.map((issue, index) => (
                        <button key={`${issue.field}-${index}`} type="button" onClick={() => setTab(issue.field)}>
                          <span className={issue.severity} aria-hidden="true" />
                          {issue.message}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="meta">
                    <div>
                      <span>Last edited</span>
                      <strong>{new Date(selected.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong>
                    </div>
                    <div>
                      <span>Dependencies</span>
                      <strong>{selected.dependencies.length}</strong>
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )
        )}
      </main>

      <input ref={importRef} hidden type="file" accept=".json" onChange={(event) => importJson(event.target.files?.[0])} />

      {toast && (
        <div className={`toast ${toast.tone}`} role="status" aria-live="polite">
          {toast.tone === 'ok' ? <Check size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
          {toast.message}
        </div>
      )}

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
      {dialog && <Dialog request={dialog.request} onResolve={resolveDialog} />}
    </div>
  )
}

function safeFilename(name: string) {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'project'
}

/** IMP-10: the browser path used a raw project name and revoked the URL early. */
function downloadInBrowser(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
