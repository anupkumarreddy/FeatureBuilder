import { useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Feature } from '../types'
import { buildChildIndex, readiness } from '../model'

export type DropPosition = 'inside' | 'before' | 'after'

interface Props {
  features: Feature[]
  selectedId: string
  expanded: Set<string>
  query: string
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onMove: (id: string, targetId: string | null, position: DropPosition) => void
}

const haystack = (feature: Feature) =>
  [
    feature.key,
    feature.title,
    feature.tags.join(' '),
    feature.owner,
    feature.description,
    ...feature.requirements.map((requirement) => `${requirement.id} ${requirement.title} ${requirement.description}`),
    ...feature.verification.scenarios.map((scenario) => `${scenario.id} ${scenario.title}`),
    feature.design.architecture,
    feature.design.behavior,
    feature.design.interfaces,
  ]
    .join(' ')
    .toLowerCase()

/**
 * IMP-04: the previous tree called descendants() and then features.find() per
 * descendant for every rendered node on every keystroke. Both the child index
 * and the search index are now computed once per project change.
 *
 * The search also reads requirement and design text, which it never used to.
 */
export function FeatureTree({ features, selectedId, expanded, query, onSelect, onToggle, onMove }: Props) {
  const childIndex = useMemo(() => buildChildIndex(features), [features])
  const searchIndex = useMemo(() => new Map(features.map((feature) => [feature.id, haystack(feature)])), [features])

  // A node is visible when it matches, or when anything beneath it matches.
  const visible = useMemo(() => {
    if (!query) return null
    const matching = new Set<string>()
    for (const feature of features) {
      if (searchIndex.get(feature.id)?.includes(query)) matching.add(feature.id)
    }
    const byId = new Map(features.map((feature) => [feature.id, feature]))
    const keep = new Set<string>()
    for (const id of matching) {
      let cursor: string | null = id
      const guard = new Set<string>()
      while (cursor !== null && !guard.has(cursor)) {
        guard.add(cursor)
        keep.add(cursor)
        cursor = byId.get(cursor)?.parentId ?? null
      }
    }
    return keep
  }, [features, query, searchIndex])

  return (
    <div className="tree-root" role="tree" aria-label="Feature map">
      <Branch
        parentId={null}
        depth={0}
        childIndex={childIndex}
        visible={visible}
        selectedId={selectedId}
        expanded={expanded}
        searching={Boolean(query)}
        onSelect={onSelect}
        onToggle={onToggle}
        onMove={onMove}
      />
    </div>
  )
}

interface BranchProps {
  parentId: string | null
  depth: number
  childIndex: Map<string | null, Feature[]>
  visible: Set<string> | null
  selectedId: string
  expanded: Set<string>
  searching: boolean
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  onMove: (id: string, targetId: string | null, position: DropPosition) => void
}

function Branch({ parentId, depth, childIndex, visible, selectedId, expanded, searching, onSelect, onToggle, onMove }: BranchProps) {
  const items = (childIndex.get(parentId) ?? []).filter((feature) => !visible || visible.has(feature.id))
  if (items.length === 0) return null

  return (
    <div className={depth === 0 ? '' : 'tree-children'} role="group">
      {items.map((feature) => {
        const children = childIndex.get(feature.id) ?? []
        const isOpen = expanded.has(feature.id) || searching
        const score = readiness(feature)
        return (
          <div key={feature.id}>
            <div
              className={`tree-row ${selectedId === feature.id ? 'selected' : ''}`}
              role="treeitem"
              aria-selected={selectedId === feature.id}
              aria-expanded={children.length ? isOpen : undefined}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('text/feature-id', feature.id)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                const bounds = event.currentTarget.getBoundingClientRect()
                const ratio = (event.clientY - bounds.top) / bounds.height
                event.currentTarget.dataset.drop = ratio < 0.28 ? 'before' : ratio > 0.72 ? 'after' : 'inside'
              }}
              onDragLeave={(event) => delete event.currentTarget.dataset.drop}
              onDrop={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const position = (event.currentTarget.dataset.drop as DropPosition) || 'inside'
                delete event.currentTarget.dataset.drop
                const dragged = event.dataTransfer.getData('text/feature-id')
                if (dragged) onMove(dragged, feature.id, position)
              }}
            >
              <button
                className="tree-toggle"
                type="button"
                tabIndex={-1}
                onClick={() => onToggle(feature.id)}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${feature.title}`}
              >
                {children.length ? isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span className="tree-dot" />}
              </button>
              <button className="tree-main" type="button" onClick={() => onSelect(feature.id)}>
                <span
                  className={`health-dot ${score === 100 ? 'ready' : score > 45 ? 'progress' : 'empty'}`}
                  title={`${score}% ready`}
                />
                <span className="tree-copy">
                  <small>{feature.key}</small>
                  <strong>{feature.title}</strong>
                </span>
              </button>
            </div>
            {isOpen && (
              <Branch
                parentId={feature.id}
                depth={depth + 1}
                childIndex={childIndex}
                visible={visible}
                selectedId={selectedId}
                expanded={expanded}
                searching={searching}
                onSelect={onSelect}
                onToggle={onToggle}
                onMove={onMove}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
