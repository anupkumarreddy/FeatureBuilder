import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, BookOpen, Check, ChevronDown, ChevronRight, CircleDot,
  ClipboardCheck, FileDown, FilePlus2, FolderOpen, GitBranch,
  Link2, MoreHorizontal, Plus, Save, Search, Settings2, ShieldCheck, Sparkles,
  Trash2, X,
} from 'lucide-react'
import type { Feature, Project, Requirement, StageStatus, VerificationScenario } from './types'
import { createFeature, descendants, readiness, statusLabel, uid, validateProject } from './model'
import { sampleProject } from './sample'

type Tab = 'overview' | 'requirements' | 'design' | 'verification' | 'traceability'
const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' }, { id: 'requirements', label: 'Requirements' },
  { id: 'design', label: 'Design spec' }, { id: 'verification', label: 'DV plan' },
  { id: 'traceability', label: 'Traceability' },
]
const statusOptions: StageStatus[] = ['not-started', 'draft', 'in-review', 'approved', 'in-progress', 'complete', 'blocked']

function cloneSample(): Project {
  return JSON.parse(JSON.stringify({ ...sampleProject, id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }))
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="field"><span className="field-label">{label}{hint && <small>{hint}</small>}</span>{children}</label>
}

function StatusSelect({ value, onChange }: { value: StageStatus; onChange: (status: StageStatus) => void }) {
  return <select className={`status-select status-${value}`} value={value} onChange={(event) => onChange(event.target.value as StageStatus)}>
    {statusOptions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
  </select>
}

interface TreeProps {
  features: Feature[]; parentId: string | null; selectedId: string; expanded: Set<string>; query: string
  onSelect: (id: string) => void; onToggle: (id: string) => void; onDrop: (id: string, parentId: string | null) => void
}

function FeatureTree({ features, parentId, selectedId, expanded, query, onSelect, onToggle, onDrop }: TreeProps) {
  const items = features.filter((feature) => feature.parentId === parentId).sort((a, b) => a.order - b.order)
  return <div className={parentId ? 'tree-children' : 'tree-root'}>
    {items.map((feature) => {
      const children = features.filter((item) => item.parentId === feature.id)
      const matches = !query || `${feature.key} ${feature.title} ${feature.tags.join(' ')}`.toLowerCase().includes(query)
      const descendantMatch = descendants(features, feature.id).some((id) => {
        const child = features.find((item) => item.id === id)!
        return `${child.key} ${child.title} ${child.tags.join(' ')}`.toLowerCase().includes(query)
      })
      if (!matches && !descendantMatch) return null
      return <div key={feature.id}>
        <div className={`tree-row ${selectedId === feature.id ? 'selected' : ''}`} draggable
          onDragStart={(event) => event.dataTransfer.setData('feature-id', feature.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => { event.preventDefault(); onDrop(event.dataTransfer.getData('feature-id'), feature.id) }}>
          <button className="tree-toggle" onClick={() => onToggle(feature.id)} aria-label={`${expanded.has(feature.id) ? 'Collapse' : 'Expand'} ${feature.title}`}>
            {children.length ? expanded.has(feature.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span className="tree-dot" />}
          </button>
          <button className="tree-main" onClick={() => onSelect(feature.id)}>
            <span className={`health-dot ${readiness(feature) === 100 ? 'ready' : readiness(feature) > 45 ? 'progress' : 'empty'}`} />
            <span className="tree-copy"><small>{feature.key}</small><strong>{feature.title}</strong></span>
          </button>
        </div>
        {(expanded.has(feature.id) || !!query) && <FeatureTree {...{ features, selectedId, expanded, query, onSelect, onToggle, onDrop }} parentId={feature.id} />}
      </div>
    })}
  </div>
}

function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text: string; action: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>
}

function App() {
  const [project, setProject] = useState<Project>(() => {
    const saved = localStorage.getItem('featurebuilder-project')
    try { return saved ? JSON.parse(saved) : cloneSample() } catch { return cloneSample() }
  })
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState(project.features[0]?.id || '')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(project.features.filter((feature) => feature.parentId === null).map((feature) => feature.id)))
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState('')
  const [showIssues, setShowIssues] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const selected = project.features.find((feature) => feature.id === selectedId) || project.features[0]
  const issues = useMemo(() => validateProject(project), [project])
  const featureIssues = issues.filter((issue) => issue.featureId === selected?.id)

  const flash = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 2400) }
  const commit = (updater: (current: Project) => Project) => {
    setProject((current) => ({ ...updater(current), updatedAt: new Date().toISOString() }))
    setDirty(true)
  }
  const updateSelected = (patch: Partial<Feature>) => {
    if (!selected) return
    commit((current) => ({ ...current, features: current.features.map((feature) => feature.id === selected.id ? { ...feature, ...patch, updatedAt: new Date().toISOString() } : feature) }))
  }

  useEffect(() => { localStorage.setItem('featurebuilder-project', JSON.stringify(project)) }, [project])
  useEffect(() => {
    if (!dirty || !projectPath || !window.featureBuilder) return
    const timer = window.setTimeout(async () => {
      const result = await window.featureBuilder!.saveProject(project, projectPath)
      if (result?.ok) setDirty(false)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [project, projectPath, dirty])

  const addFeature = (parentId: string | null) => {
    const feature = createFeature(project, parentId)
    commit((current) => ({ ...current, features: [...current.features, feature] }))
    if (parentId) setExpanded((current) => new Set(current).add(parentId))
    setSelectedId(feature.id); setTab('overview')
  }
  const deleteFeature = () => {
    if (!selected || !window.confirm(`Delete ${selected.key} and all of its child features?`)) return
    const removed = new Set([selected.id, ...descendants(project.features, selected.id)])
    const remaining = project.features.filter((feature) => !removed.has(feature.id)).map((feature) => ({ ...feature, dependencies: feature.dependencies.filter((id) => !removed.has(id)) }))
    commit((current) => ({ ...current, features: remaining }))
    setSelectedId(remaining[0]?.id || '')
  }
  const moveFeature = (id: string, parentId: string | null) => {
    if (!id || id === parentId || descendants(project.features, id).includes(parentId || '')) return
    commit((current) => ({ ...current, features: current.features.map((feature) => feature.id === id ? { ...feature, parentId, order: current.features.filter((item) => item.parentId === parentId).length } : feature) }))
    if (parentId) setExpanded((current) => new Set(current).add(parentId))
  }
  const save = async () => {
    if (window.featureBuilder) {
      const result = await window.featureBuilder.saveProject(project, projectPath)
      if (result?.error) return flash(result.error)
      if (result?.ok) { setProjectPath(result.projectPath || projectPath); setDirty(false); flash('Project saved') }
    } else { localStorage.setItem('featurebuilder-project', JSON.stringify(project)); setDirty(false); flash('Saved in browser storage') }
  }
  const open = async () => {
    if (window.featureBuilder) {
      const result = await window.featureBuilder.openProject()
      if (result?.error) return flash(result.error)
      if (result?.project) { setProject(result.project); setProjectPath(result.projectPath || null); setSelectedId(result.project.features[0]?.id || ''); setDirty(false); flash('Project opened') }
    } else importRef.current?.click()
  }
  const importJson = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { try { const loaded = JSON.parse(String(reader.result)) as Project; setProject(loaded); setSelectedId(loaded.features[0]?.id || ''); setProjectPath(null); setDirty(false); flash('Project imported') } catch { flash('That file is not a valid project') } }
    reader.readAsText(file)
  }
  const exportProject = async () => {
    if (window.featureBuilder) { await window.featureBuilder.exportProject(project); return flash('Archive exported') }
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${project.name}.featurebuilder.json`; link.click(); URL.revokeObjectURL(link.href)
  }
  const newProject = () => {
    if (dirty && !window.confirm('Start a new project? Your current changes are stored locally but may not be saved to the project folder.')) return
    const next = cloneSample(); next.name = 'Untitled project'; next.description = ''; next.prefix = 'FEAT'; next.features = []
    setProject(next); setProjectPath(null); setSelectedId(''); setDirty(true)
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="traffic-space" />
      <div className="brand"><div className="brand-mark"><GitBranch size={18} /></div><div><strong>FeatureBuilder</strong><span>SPEC WORKSPACE</span></div></div>
      <button className="project-card" title="Edit project name" onClick={() => {
        const name = window.prompt('Project name', project.name); if (name?.trim()) commit((current) => ({ ...current, name: name.trim() }))
      }}><span className="project-avatar">{project.name.slice(0, 2).toUpperCase()}</span><span><strong>{project.name}</strong><small>{project.features.length} features · local</small></span><MoreHorizontal size={16} /></button>
      <div className="search"><Search size={15} /><input aria-label="Search features" placeholder="Search features" value={query} onChange={(event) => setQuery(event.target.value.toLowerCase())} /><kbd>⌘K</kbd></div>
      <div className="tree-heading"><span>FEATURE MAP</span><button aria-label="Add root feature" title="Add root feature" onClick={() => addFeature(null)}><Plus size={16} /></button></div>
      <div className="tree-scroll" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { if (event.target === event.currentTarget) moveFeature(event.dataTransfer.getData('feature-id'), null) }}>
        {project.features.length ? <FeatureTree features={project.features} parentId={null} selectedId={selected?.id || ''} expanded={expanded} query={query} onSelect={setSelectedId} onToggle={(id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })} onDrop={moveFeature} /> :
          <div className="sidebar-empty">No features yet.<button onClick={() => addFeature(null)}>Create the first one</button></div>}
      </div>
      <div className="sidebar-footer">
        <button onClick={newProject}><FilePlus2 size={16} />New</button><button onClick={open}><FolderOpen size={16} />Open</button><button onClick={save}><Save size={16} />Save</button>
      </div>
    </aside>

    <main className="workspace">
      <header className="topbar">
        <div className="breadcrumbs"><span>{project.name}</span><ChevronRight size={14} />{selected ? <><span>{selected.parentId ? project.features.find((feature) => feature.id === selected.parentId)?.title : 'Features'}</span><ChevronRight size={14} /><strong>{selected.key}</strong></> : <strong>Workspace</strong>}</div>
        <div className="top-actions"><span className={`save-state ${dirty ? 'dirty' : ''}`}>{dirty ? 'Unsaved changes' : <><Check size={13} />Saved</>}</span><button className="icon-button" title="Export archive" onClick={exportProject}><FileDown size={17} /></button><button className="primary-button" onClick={save}><Save size={15} />Save project</button></div>
      </header>

      {selected ? <>
        <section className="feature-header">
          <div className="eyebrow"><span>{selected.key}</span><span className={`priority priority-${selected.priority.toLowerCase()}`}>{selected.priority}</span></div>
          <div className="title-row"><input className="title-input" aria-label="Feature title" value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} /><div className="header-actions"><button title="Add child feature" onClick={() => addFeature(selected.id)}><Plus size={16} />Child feature</button><button className="danger-ghost" title="Delete feature" onClick={deleteFeature}><Trash2 size={16} /></button></div></div>
          <nav className="tabs">{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}{item.id === 'traceability' && <span className="tab-count">{selected.requirements.length}</span>}</button>)}</nav>
        </section>
        <div className="content-wrap">
          <section className="editor">
            {tab === 'overview' && <Overview feature={selected} update={updateSelected} />}
            {tab === 'requirements' && <Requirements feature={selected} update={updateSelected} />}
            {tab === 'design' && <Design feature={selected} update={updateSelected} />}
            {tab === 'verification' && <Verification feature={selected} update={updateSelected} />}
            {tab === 'traceability' && <Traceability feature={selected} />}
          </section>
          <aside className="inspector">
            <div className="inspector-title"><span>READINESS</span><strong>{readiness(selected)}%</strong></div>
            <div className="progress-track"><span style={{ width: `${readiness(selected)}%` }} /></div>
            <p>{featureIssues.length ? `${featureIssues.length} items need attention before review.` : 'This feature is ready for review.'}</p>
            <div className="status-stack">
              {(['specification', 'design', 'dv'] as const).map((key) => <div key={key}><label>{key === 'dv' ? 'DV plan' : key}</label><StatusSelect value={selected.statuses[key]} onChange={(status) => updateSelected({ statuses: { ...selected.statuses, [key]: status } })} /></div>)}
            </div>
            <button className="issues-button" onClick={() => setShowIssues((value) => !value)}><AlertTriangle size={16} /><span>{featureIssues.length} validation issues</span><ChevronDown size={15} /></button>
            {showIssues && <div className="issue-list">{featureIssues.map((issue, index) => <button key={`${issue.field}-${index}`} onClick={() => setTab(issue.field === 'overview' ? 'overview' : issue.field as Tab)}><span className={issue.severity} />{issue.message}</button>)}</div>}
            <div className="meta"><div><span>Last edited</span><strong>{new Date(selected.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong></div><div><span>Dependencies</span><strong>{selected.dependencies.length}</strong></div></div>
          </aside>
        </div>
      </> : <EmptyState icon={<Sparkles size={30} />} title="Start with a feature" text="Build a structured specification by adding the first top-level feature." action={<button className="primary-button" onClick={() => addFeature(null)}><Plus size={16} />Add first feature</button>} />}
    </main>
    <input ref={importRef} hidden type="file" accept=".json" onChange={(event) => importJson(event.target.files?.[0])} />
    {toast && <div className="toast"><Check size={16} />{toast}</div>}
  </div>
}

function Overview({ feature, update }: { feature: Feature; update: (patch: Partial<Feature>) => void }) {
  return <div className="panel-stack">
    <div className="section-intro"><div className="section-icon mint"><BookOpen size={18} /></div><div><h2>Feature intent</h2><p>Define why this feature exists and who is responsible for it.</p></div></div>
    <Field label="Description" hint="Required"><textarea rows={5} placeholder="Describe the user-visible or architectural outcome…" value={feature.description} onChange={(event) => update({ description: event.target.value })} /></Field>
    <div className="two-col"><Field label="Owner"><input placeholder="Assign an owner" value={feature.owner} onChange={(event) => update({ owner: event.target.value })} /></Field><Field label="Priority"><select value={feature.priority} onChange={(event) => update({ priority: event.target.value as Feature['priority'] })}>{['Critical', 'High', 'Medium', 'Low'].map((value) => <option key={value}>{value}</option>)}</select></Field></div>
    <Field label="Tags" hint="Comma separated"><input placeholder="power, low-power, v1.0" value={feature.tags.join(', ')} onChange={(event) => update({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} /></Field>
    <div className="section-divider" />
    <ListEditor title="Open questions" subtitle="Capture decisions that still block specification approval." values={feature.openQuestions} placeholder="What needs to be resolved?" onChange={(openQuestions) => update({ openQuestions })} />
  </div>
}

function Requirements({ feature, update }: { feature: Feature; update: (patch: Partial<Feature>) => void }) {
  const add = () => update({ requirements: [...feature.requirements, { id: `REQ-${feature.key}-${String(feature.requirements.length + 1).padStart(2, '0')}`, title: 'New requirement', description: '', type: 'Functional', status: 'Draft' }] })
  const change = (index: number, patch: Partial<Requirement>) => update({ requirements: feature.requirements.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })
  return <div className="panel-stack">
    <div className="section-intro with-action"><div className="section-icon blue"><CircleDot size={18} /></div><div><h2>Requirements</h2><p>Write atomic, testable statements with stable identifiers.</p></div><button className="secondary-button" onClick={add}><Plus size={15} />Add requirement</button></div>
    {feature.requirements.length === 0 ? <EmptyState icon={<ClipboardCheck size={25} />} title="No requirements yet" text="Add the first testable requirement for this feature." action={<button className="primary-button" onClick={add}><Plus size={15} />Add requirement</button>} /> :
      <div className="card-list">{feature.requirements.map((requirement, index) => <article className="item-card" key={`${requirement.id}-${index}`}>
        <div className="item-card-top"><input className="id-input" value={requirement.id} aria-label="Requirement ID" onChange={(event) => change(index, { id: event.target.value })} /><select value={requirement.type} onChange={(event) => change(index, { type: event.target.value as Requirement['type'] })}>{['Functional', 'Performance', 'Safety', 'Interface'].map((type) => <option key={type}>{type}</option>)}</select><select value={requirement.status} onChange={(event) => change(index, { status: event.target.value as Requirement['status'] })}><option>Draft</option><option>Approved</option></select><button className="danger-ghost" aria-label="Delete requirement" onClick={() => update({ requirements: feature.requirements.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={15} /></button></div>
        <input className="card-title-input" value={requirement.title} onChange={(event) => change(index, { title: event.target.value })} />
        <textarea rows={3} placeholder="The system shall…" value={requirement.description} onChange={(event) => change(index, { description: event.target.value })} />
      </article>)}</div>}
  </div>
}

function Design({ feature, update }: { feature: Feature; update: (patch: Partial<Feature>) => void }) {
  const change = (key: keyof Feature['design'], value: string) => update({ design: { ...feature.design, [key]: value } })
  return <div className="panel-stack"><div className="section-intro"><div className="section-icon amber"><Settings2 size={18} /></div><div><h2>Design specification</h2><p>Describe the implementation contract without tying it to DV execution.</p></div></div>
    <Field label="Architecture"><textarea rows={4} placeholder="Blocks, responsibilities, and data flow…" value={feature.design.architecture} onChange={(event) => change('architecture', event.target.value)} /></Field>
    <Field label="Interfaces and signals"><textarea rows={4} placeholder="Ports, protocols, registers, and configuration…" value={feature.design.interfaces} onChange={(event) => change('interfaces', event.target.value)} /></Field>
    <Field label="Expected behavior" hint="Required"><textarea rows={5} placeholder="State transitions, ordering, and observable behavior…" value={feature.design.behavior} onChange={(event) => change('behavior', event.target.value)} /></Field>
    <div className="two-col"><Field label="Reset and error behavior"><textarea rows={5} value={feature.design.resetAndErrors} onChange={(event) => change('resetAndErrors', event.target.value)} /></Field><Field label="Performance constraints"><textarea rows={5} value={feature.design.performance} onChange={(event) => change('performance', event.target.value)} /></Field></div>
  </div>
}

function Verification({ feature, update }: { feature: Feature; update: (patch: Partial<Feature>) => void }) {
  const change = (key: keyof Omit<Feature['verification'], 'scenarios'>, value: string) => update({ verification: { ...feature.verification, [key]: value } })
  const add = () => update({ verification: { ...feature.verification, scenarios: [...feature.verification.scenarios, { id: `SCN-${feature.key}-${String(feature.verification.scenarios.length + 1).padStart(2, '0')}`, title: 'New verification scenario', description: '', method: 'Simulation', linkedRequirements: [] }] } })
  const patchScenario = (index: number, patch: Partial<VerificationScenario>) => update({ verification: { ...feature.verification, scenarios: feature.verification.scenarios.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) } })
  return <div className="panel-stack"><div className="section-intro"><div className="section-icon violet"><ShieldCheck size={18} /></div><div><h2>DV plan</h2><p>Define how the requirements will be proven and measured.</p></div></div>
    <Field label="Verification strategy" hint="Required"><textarea rows={5} placeholder="Describe environments, methods, stimulus, and checking…" value={feature.verification.strategy} onChange={(event) => change('strategy', event.target.value)} /></Field>
    <div className="two-col"><Field label="Assertions and checkers"><textarea rows={4} value={feature.verification.assertions} onChange={(event) => change('assertions', event.target.value)} /></Field><Field label="Functional coverage"><textarea rows={4} value={feature.verification.coverage} onChange={(event) => change('coverage', event.target.value)} /></Field></div>
    <Field label="Exclusions"><textarea rows={3} placeholder="What is intentionally verified elsewhere?" value={feature.verification.exclusions} onChange={(event) => change('exclusions', event.target.value)} /></Field>
    <div className="subheading"><div><h3>Verification scenarios</h3><p>Link every scenario to the requirements it proves.</p></div><button className="secondary-button" onClick={add}><Plus size={15} />Add scenario</button></div>
    {feature.verification.scenarios.map((scenario, index) => <article className="item-card scenario-card" key={`${scenario.id}-${index}`}>
      <div className="item-card-top"><input className="id-input" value={scenario.id} onChange={(event) => patchScenario(index, { id: event.target.value })} /><select value={scenario.method} onChange={(event) => patchScenario(index, { method: event.target.value as VerificationScenario['method'] })}>{['Simulation', 'Formal', 'Emulation', 'Inspection'].map((method) => <option key={method}>{method}</option>)}</select><button className="danger-ghost" onClick={() => update({ verification: { ...feature.verification, scenarios: feature.verification.scenarios.filter((_, itemIndex) => itemIndex !== index) } })}><Trash2 size={15} /></button></div>
      <input className="card-title-input" value={scenario.title} onChange={(event) => patchScenario(index, { title: event.target.value })} /><textarea rows={3} value={scenario.description} onChange={(event) => patchScenario(index, { description: event.target.value })} />
      <div className="link-row"><Link2 size={14} /><span>Verifies</span>{feature.requirements.map((requirement) => <label key={requirement.id} className={`link-chip ${scenario.linkedRequirements.includes(requirement.id) ? 'active' : ''}`}><input type="checkbox" checked={scenario.linkedRequirements.includes(requirement.id)} onChange={(event) => patchScenario(index, { linkedRequirements: event.target.checked ? [...scenario.linkedRequirements, requirement.id] : scenario.linkedRequirements.filter((id) => id !== requirement.id) })} />{requirement.id}</label>)}</div>
    </article>)}
  </div>
}

function Traceability({ feature }: { feature: Feature }) {
  if (!feature.requirements.length) return <EmptyState icon={<Link2 size={26} />} title="Nothing to trace yet" text="Add requirements first, then connect them to verification scenarios." action={<span className="empty-hint">Requirements → DV plan → Traceability</span>} />
  return <div className="panel-stack"><div className="section-intro"><div className="section-icon coral"><Link2 size={18} /></div><div><h2>Traceability matrix</h2><p>See which requirements are covered by planned verification scenarios.</p></div></div>
    <div className="matrix-wrap"><table className="matrix"><thead><tr><th>Requirement</th>{feature.verification.scenarios.map((scenario) => <th key={scenario.id}><span>{scenario.id}</span>{scenario.title}</th>)}<th>Coverage</th></tr></thead><tbody>{feature.requirements.map((requirement) => { const count = feature.verification.scenarios.filter((scenario) => scenario.linkedRequirements.includes(requirement.id)).length; return <tr key={requirement.id}><td><strong>{requirement.id}</strong><span>{requirement.title}</span></td>{feature.verification.scenarios.map((scenario) => <td key={scenario.id}>{scenario.linkedRequirements.includes(requirement.id) ? <span className="matrix-check"><Check size={15} /></span> : <span className="matrix-empty">—</span>}</td>)}<td><span className={`coverage-pill ${count ? 'covered' : 'gap'}`}>{count ? `${count} linked` : 'Gap'}</span></td></tr> })}</tbody></table></div>
  </div>
}

function ListEditor({ title, subtitle, values, placeholder, onChange }: { title: string; subtitle: string; values: string[]; placeholder: string; onChange: (values: string[]) => void }) {
  return <div><div className="subheading"><div><h3>{title}</h3><p>{subtitle}</p></div><button className="secondary-button" onClick={() => onChange([...values, ''])}><Plus size={15} />Add</button></div><div className="simple-list">{values.map((value, index) => <div key={index}><span>{index + 1}</span><input autoFocus={!value} placeholder={placeholder} value={value} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /><button onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button></div>)}</div></div>
}

export default App
