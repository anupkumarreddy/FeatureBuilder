import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { sampleProject } from './sample'

const setup = () => ({ user: userEvent.setup(), ...render(<App />) })

/** Feature keys appear in the tree, the breadcrumb and the header, so tree
 *  assertions are scoped to the tree itself. */
const tree = () => within(screen.getByRole('tree', { name: 'Feature map' }))
const sidebar = () => within(document.querySelector('.sidebar') as HTMLElement)

beforeEach(() => {
  window.localStorage.clear()
})

describe('project identity', () => {
  /**
   * BUG-01: this ran through window.prompt(), which Electron does not
   * implement — it throws, so renaming was impossible in the packaged app.
   */
  it('renames a project without calling window.prompt', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => {
      throw new Error('prompt() is not supported.')
    })
    const { user } = setup()

    await user.click(screen.getByTitle('Rename project'))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText('Project name')
    await user.clear(input)
    await user.type(input, 'Borealis SoC')
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(prompt).not.toHaveBeenCalled()
    await waitFor(() => expect(sidebar().getByText('Borealis SoC')).toBeInTheDocument())
  })

  it('rejects an empty project name instead of accepting it', async () => {
    const { user } = setup()
    await user.click(screen.getByTitle('Rename project'))
    const dialog = await screen.findByRole('dialog')
    await user.clear(within(dialog).getByLabelText('Project name'))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(within(dialog).getByText('Give the project a name.')).toBeInTheDocument()
  })

  it('closes the rename dialog on Escape without changing anything', async () => {
    const { user } = setup()
    await user.click(screen.getByTitle('Rename project'))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(sidebar().getByText(sampleProject.name)).toBeInTheDocument()
  })
})

describe('feature editing', () => {
  it('adds a feature and selects it', async () => {
    const { user } = setup()
    await user.click(screen.getByTitle('Add root feature'))
    expect(await screen.findByDisplayValue('Untitled feature')).toBeInTheDocument()
  })

  // BUG-10: two adds from one render snapshot produced the same key.
  it('gives every rapidly added feature its own key', async () => {
    const { user } = setup()
    const add = screen.getByTitle('Add root feature')
    await user.click(add)
    await user.click(add)
    await user.click(add)

    const keys = tree().getAllByText(/^AUR-\d{3}$/).map((node) => node.textContent)
    expect(keys).toHaveLength(7)
    expect(new Set(keys).size).toBe(keys.length)
  })

  // BUG-14: a stale selection silently edited features[0].
  it('shows the project overview rather than editing a different feature after a delete', async () => {
    const { user } = setup()
    await user.click(tree().getByRole('button', { name: /AUR-002/ }))
    await user.click(screen.getByRole('button', { name: /^Delete AUR-002/ }))

    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('table', { name: /readiness and coverage/i })).toBeInTheDocument()
  })

  it('undoes a deletion', async () => {
    const { user } = setup()
    await user.click(tree().getByRole('button', { name: /AUR-002/ }))
    await user.click(screen.getByRole('button', { name: /^Delete AUR-002/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await screen.findByRole('table', { name: /readiness and coverage/i })

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(tree().getByRole('button', { name: /AUR-002/ })).toBeInTheDocument())
  })
})

describe('open questions list', () => {
  // BUG-15: index keys plus autoFocus shifted text between reused rows.
  it('removes the row the user asked for, not the last one', async () => {
    const { user } = setup()
    // AUR-002 ships with no open questions, so row numbers map to what we add.
    await user.click(tree().getByRole('button', { name: /AUR-002/ }))

    const add = screen.getByRole('button', { name: 'Add' })
    await user.click(add)
    await user.type(screen.getByLabelText('Open questions 1'), 'first')
    await user.click(add)
    await user.type(screen.getByLabelText('Open questions 2'), 'second')
    await user.click(add)
    await user.type(screen.getByLabelText('Open questions 3'), 'third')

    await user.click(screen.getByRole('button', { name: 'Remove Open questions 1' }))

    expect(screen.getByLabelText('Open questions 1')).toHaveValue('second')
    expect(screen.getByLabelText('Open questions 2')).toHaveValue('third')
    expect(screen.queryByLabelText('Open questions 3')).not.toBeInTheDocument()
  })
})

describe('command palette', () => {
  it('opens with the keyboard and jumps to a feature', async () => {
    const { user } = setup()
    await user.keyboard('{Meta>}k{/Meta}')

    const palette = await screen.findByRole('dialog', { name: 'Command palette' })
    await user.type(within(palette).getByLabelText('Search features and commands'), 'Wake')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('Feature title')).toHaveValue('Wake-up Sources')
  })
})

describe('search', () => {
  // Search used to read only key, title and tags.
  it('matches requirement text, not just titles and tags', async () => {
    const { user } = setup()
    const search = screen.getByLabelText('Search features')
    await user.type(search, 'deterministic sleep')

    await waitFor(() => expect(tree().getByRole('button', { name: /AUR-001/ })).toBeInTheDocument())
    expect(tree().queryByRole('button', { name: /AUR-004/ })).not.toBeInTheDocument()
  })
})
