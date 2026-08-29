export type StageStatus = 'not-started' | 'draft' | 'in-review' | 'approved' | 'in-progress' | 'complete' | 'blocked'
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'
export type RequirementType = 'Functional' | 'Performance' | 'Safety' | 'Interface'
export type RequirementStatus = 'Draft' | 'Approved'
export type VerificationMethod = 'Simulation' | 'Formal' | 'Emulation' | 'Inspection'

export interface Requirement {
  id: string
  title: string
  description: string
  type: RequirementType
  status: RequirementStatus
}

export interface VerificationScenario {
  id: string
  title: string
  description: string
  method: VerificationMethod
  linkedRequirements: string[]
}

export interface FeatureDesign {
  architecture: string
  interfaces: string
  behavior: string
  resetAndErrors: string
  performance: string
}

export interface FeatureVerification {
  strategy: string
  assertions: string
  coverage: string
  exclusions: string
  scenarios: VerificationScenario[]
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
  design: FeatureDesign
  verification: FeatureVerification
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

export type IssueField = 'overview' | 'requirements' | 'design' | 'verification' | 'traceability'

export interface ValidationIssue {
  featureId: string
  field: IssueField
  message: string
  severity: 'warning' | 'error'
}

export interface OpenResult {
  project?: Project
  projectPath?: string
  error?: string
  canceled?: boolean
}

export interface SaveResult {
  ok?: boolean
  projectPath?: string
  error?: string
  canceled?: boolean
}

export interface WriteResult {
  ok?: boolean
  filePath?: string
  error?: string
  canceled?: boolean
}

export interface SaveTextRequest {
  defaultName: string
  contents: string
  extension: string
  description: string
}

export interface DesktopApi {
  openProject(): Promise<OpenResult>
  openRecentProject(projectPath: string): Promise<OpenResult>
  saveProject(project: Project, projectPath: string | null, options?: { saveAs?: boolean }): Promise<SaveResult>
  exportProject(project: Project): Promise<WriteResult>
  saveTextFile(request: SaveTextRequest): Promise<WriteResult>
  getRecentProjects(): Promise<string[]>
  forgetRecentProject(projectPath: string): Promise<void>
  setUnsavedChanges(dirty: boolean): void
  closeWindow(): void
  onMenuCommand(handler: (command: string) => void): () => void
}

declare global {
  interface Window {
    featureBuilder?: DesktopApi
  }
}
