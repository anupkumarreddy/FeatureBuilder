import type { Project } from './types'

const now = new Date().toISOString()
export const sampleProject: Project = {
  schemaVersion: 1,
  id: 'aurora-demo',
  name: 'Aurora SoC',
  description: 'Feature specification and verification plan for the Aurora subsystem.',
  prefix: 'AUR',
  createdAt: now,
  updatedAt: now,
  features: [
    {
      id: 'power', key: 'AUR-001', title: 'Power Management', parentId: null, order: 0,
      description: 'Coordinate low-power entry, clock gating, and deterministic wake-up across the subsystem.',
      owner: 'Maya Chen', priority: 'Critical', tags: ['power', 'v1.0'],
      statuses: { specification: 'approved', design: 'in-progress', dv: 'draft' },
      requirements: [
        { id: 'REQ-PWR-01', title: 'Deterministic sleep entry', description: 'The subsystem shall enter sleep within 12 cycles after an accepted request.', type: 'Performance', status: 'Approved' },
        { id: 'REQ-PWR-02', title: 'Wake source retention', description: 'All enabled wake sources shall remain observable while clocks are gated.', type: 'Functional', status: 'Approved' },
      ],
      design: {
        architecture: 'A central power controller sequences isolation, retention, and clock controls.',
        interfaces: 'pwr_req_i, pwr_ack_o, wake_sources_i[7:0], clk_gate_o',
        behavior: 'Requests are synchronized, qualified against outstanding traffic, and acknowledged after safe quiescence.',
        resetAndErrors: 'Reset returns the controller to ACTIVE. Conflicting requests set sticky status and preserve ACTIVE.',
        performance: 'Entry latency ≤ 12 cycles; wake acknowledgement ≤ 4 cycles.',
      },
      verification: {
        strategy: 'Use constrained-random power transitions with assertion-based protocol checks and targeted reset injection.',
        assertions: 'Entry ordering, acknowledgment stability, no gated-clock activity, legal state transitions.',
        coverage: 'Cross power state × wake source × traffic state; latency bins at 1, 4, 8, and 12 cycles.',
        exclusions: 'Analog rail ramp behavior is verified at the top-level mixed-signal environment.',
        scenarios: [
          { id: 'SCN-PWR-01', title: 'Nominal sleep entry', description: 'Issue a sleep request after traffic drains and check sequencing and latency.', method: 'Simulation', linkedRequirements: ['REQ-PWR-01'] },
          { id: 'SCN-PWR-02', title: 'Wake while gated', description: 'Toggle each enabled wake source during clock gating and check recovery.', method: 'Simulation', linkedRequirements: ['REQ-PWR-02'] },
        ],
      },
      dependencies: [], openQuestions: ['Should debug wake bypass the programmable wake mask?'], updatedAt: now,
    },
    {
      id: 'clock-gating', key: 'AUR-002', title: 'Clock Gating', parentId: 'power', order: 0,
      description: 'Suppress idle-domain clocks without exposing glitches or losing architectural state.',
      owner: 'Leo Martin', priority: 'High', tags: ['clocking'],
      statuses: { specification: 'in-review', design: 'draft', dv: 'not-started' },
      requirements: [{ id: 'REQ-CG-01', title: 'Glitch-free gating', description: 'Generated clocks shall contain no runt pulses.', type: 'Safety', status: 'Approved' }],
      design: { architecture: 'Integrated clock-gating cells at domain roots.', interfaces: 'idle_i, scan_enable_i, gated_clk_o', behavior: 'Gate closes only while the source clock is low.', resetAndErrors: '', performance: '' },
      verification: { strategy: '', assertions: '', coverage: '', exclusions: '', scenarios: [] },
      dependencies: [], openQuestions: [], updatedAt: now,
    },
    {
      id: 'wakeup', key: 'AUR-003', title: 'Wake-up Sources', parentId: 'power', order: 1,
      description: 'Qualify and prioritize external and internal wake events.', owner: 'Maya Chen', priority: 'High', tags: ['power', 'interrupts'],
      statuses: { specification: 'draft', design: 'not-started', dv: 'not-started' },
      requirements: [], design: { architecture: '', interfaces: '', behavior: '', resetAndErrors: '', performance: '' },
      verification: { strategy: '', assertions: '', coverage: '', exclusions: '', scenarios: [] },
      dependencies: ['power'], openQuestions: [], updatedAt: now,
    },
    {
      id: 'interrupts', key: 'AUR-004', title: 'Interrupt Controller', parentId: null, order: 1,
      description: 'Collect, prioritize, and deliver subsystem interrupts.', owner: 'Arun Nair', priority: 'High', tags: ['interrupts'],
      statuses: { specification: 'draft', design: 'not-started', dv: 'not-started' },
      requirements: [], design: { architecture: '', interfaces: '', behavior: '', resetAndErrors: '', performance: '' },
      verification: { strategy: '', assertions: '', coverage: '', exclusions: '', scenarios: [] },
      dependencies: [], openQuestions: [], updatedAt: now,
    },
  ],
}
