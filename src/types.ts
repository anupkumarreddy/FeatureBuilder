export type StageStatus = 'not-started' | 'draft' | 'in-review' | 'approved' | 'in-progress' | 'complete' | 'blocked'
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'

export interface Requirement {
  id: string
  title: string
  description: string
  type: 'Functional' | 'Performance' | 'Safety' | 'Interface'
  status: 'Draft' | 'Approved'
}

export interface VerificationScenario {
  id: string
  title: string
  description: string
  method: 'Simulation' | 'Formal' | 'Emulation' | 'Inspection'
  linkedRequirements: string[]
}

export interface Feature {
  id: string
  key: string
  title: string
  parentId: string | null
  order: number
  description: string
  owner: string
  priority: Priority
  tags: string[]
  statuses: { specification: StageStatus; design: StageStatus; dv: StageStatus }
  requirements: Requirement[]
  design: {
    architecture: string
    interfaces: string
    behavior: string
    resetAndErrors: string
    performance: string
  }
  verification: {
    strategy: string
    assertions: string
    coverage: string
    exclusions: string
    scenarios: VerificationScenario[]
  }
  dependencies: string[]
  openQuestions: string[]
  updatedAt: string
}

export interface Project {
  schemaVersion: 1
  id: string
  name: string
  description: string
  prefix: string
  createdAt: string
  updatedAt: string
  features: Feature[]
}

export interface ValidationIssue {
  featureId: string
  field: string
  message: string
  severity: 'warning' | 'error'
}

export interface DesktopApi {
  openProject(): Promise<{ project?: Project; projectPath?: string; error?: string } | null>
  saveProject(project: Project, projectPath: string | null): Promise<{ ok?: boolean; projectPath?: string; error?: string } | null>
  exportProject(project: Project): Promise<{ ok?: boolean; filePath?: string } | null>
  getRecentProjects(): Promise<string[]>
}

declare global { interface Window { featureBuilder?: DesktopApi } }
