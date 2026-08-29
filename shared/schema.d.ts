import type { Project } from '../src/types'

export declare const MAX_FEATURES: number
export declare const MAX_JSON_BYTES: number
export declare const MAX_LIST_ITEMS: number
export declare const MAX_PROJECT_BYTES: number
export declare const SAFE_ID: RegExp

export declare class SchemaError extends Error {
  name: 'SchemaError'
}

export declare function assertAcyclic(features: { id: string; parentId: string | null }[]): void
export declare function assertSafeId(value: unknown, label?: string): string
export declare function assertString(value: unknown, label: string): string
export declare function assertStringArray(value: unknown, label: string, maximum?: number): string[]
export declare function utf8Bytes(value: string): number
export declare function validateProject(project: unknown): Project
