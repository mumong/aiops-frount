import type {
  EvidenceDimension,
  EvidenceEntity,
  ParallelEvidenceGroup,
  ParallelEvidenceResult,
  ParallelEvidenceState,
  ToolCall,
} from './types'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJsonObject(value: unknown): UnknownRecord | undefined {
  if (isRecord(value)) return value
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed

  try {
    const parsed: unknown = JSON.parse(unfenced)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function normalizeEntity(value: unknown): EvidenceEntity | undefined {
  if (!isRecord(value)) return undefined
  const namespace = String(value.namespace || '').trim()
  const name = String(value.name || value.pod || '').trim()
  if (!namespace || !name) return undefined
  return {
    kind: String(value.kind || 'Pod').trim() || 'Pod',
    namespace,
    name,
  }
}

function normalizeStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

export function extractParallelEvidenceGroups(
  snapshot: Record<string, unknown> | undefined,
): ParallelEvidenceGroup[] {
  const analysis = parseJsonObject(snapshot?.layer_analysis)
  const rawGroups = analysis?.abnormal_groups
  if (!Array.isArray(rawGroups)) return []

  const groups = rawGroups.flatMap((value): ParallelEvidenceGroup[] => {
    if (!isRecord(value)) return []
    const groupId = String(value.group_id || '').trim()
    const entities = Array.isArray(value.entities)
      ? value.entities.map(normalizeEntity).filter((item): item is EvidenceEntity => Boolean(item))
      : []
    if (!groupId || entities.length === 0) return []

    return [{
      groupId,
      abnormalType: String(value.pod_abnormal_type || '').trim() || 'Unknown',
      statusKeywords: normalizeStrings(value.status_keywords),
      entities,
      results: [],
    }]
  })

  return groups.length > 2 ? groups : []
}

function extractMarkerJson(text: string, marker: string): unknown {
  const markerIndex = text.indexOf(`${marker}=`)
  if (markerIndex < 0) return undefined

  let cursor = markerIndex + marker.length + 1
  while (/\s/.test(text[cursor] || '')) cursor += 1
  const opening = text[cursor]
  if (opening !== '{' && opening !== '[') return undefined
  const closing = opening === '{' ? '}' : ']'
  const start = cursor
  let depth = 0
  let inString = false
  let escaped = false

  for (; cursor < text.length; cursor += 1) {
    const char = text[cursor]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === opening) {
      depth += 1
    } else if (char === closing) {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, cursor + 1))
        } catch {
          return undefined
        }
      }
    }
  }

  return undefined
}

function normalizeDimension(value: unknown, toolName: string): EvidenceDimension {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'kubernetes' || raw === 'k8s') return 'kubernetes'
  if (raw === 'metrics' || raw === 'metric' || raw === 'prometheus') return 'metrics'
  if (raw === 'logging' || raw === 'logs' || raw === 'log') return 'logging'
  if (raw === 'tracing' || raw === 'traces' || raw === 'trace') return 'tracing'
  if (raw === 'topology') return 'topology'
  if (toolName.startsWith('kubectl_') || toolName.startsWith('kubernetes_')) {
    return 'kubernetes'
  }
  return 'other'
}

export function parseParallelResultMetadata(
  toolName: string,
  resultPreview: string,
): {
  dimension: EvidenceDimension
  sourceSystem?: string
  entity?: EvidenceEntity
} {
  const observability = extractMarkerJson(resultPreview, 'OBSERVABILITY_QUERY')
  const observabilityRecord = isRecord(observability) ? observability : undefined
  const dimension = normalizeDimension(observabilityRecord?.dimension, toolName)
  const markerEntity = normalizeEntity(extractMarkerJson(resultPreview, 'ENTITY'))
  const labeledName = resultPreview.match(/(?:^|\n)name:\s*([^\s]+)/i)?.[1]
  const labeledNamespace = resultPreview.match(/(?:^|\n)namespace:\s*([^\s]+)/i)?.[1]
  const kubernetesEntity = dimension === 'kubernetes' && labeledName && labeledNamespace
    ? normalizeEntity({ kind: 'Pod', namespace: labeledNamespace, name: labeledName })
    : undefined
  const entity = markerEntity || kubernetesEntity
  const sourceSystem = String(observabilityRecord?.source_system || '').trim()

  return {
    dimension,
    ...(sourceSystem ? { sourceSystem } : {}),
    ...(entity ? { entity } : {}),
  }
}

export function createParallelEvidenceState(
  groups: ParallelEvidenceGroup[],
): ParallelEvidenceState {
  return {
    status: 'running',
    groups: groups.map(group => ({
      ...group,
      statusKeywords: [...group.statusKeywords],
      entities: group.entities.map(entity => ({ ...entity })),
      results: group.results.map(result => ({ ...result })),
    })),
    pendingTools: [],
    unassignedResults: [],
  }
}

export function startParallelTool(
  state: ParallelEvidenceState,
  tool: ToolCall,
): ParallelEvidenceState {
  return {
    ...state,
    status: 'running',
    pendingTools: [...state.pendingTools, { ...tool }],
  }
}

function removeFirstPendingTool(
  pendingTools: ToolCall[],
  toolName: string,
): { pendingTools: ToolCall[]; matched?: ToolCall } {
  const index = pendingTools.findIndex(tool => tool.toolName === toolName)
  if (index < 0) return { pendingTools }
  return {
    matched: pendingTools[index],
    pendingTools: [
      ...pendingTools.slice(0, index),
      ...pendingTools.slice(index + 1),
    ],
  }
}

function entityMatches(left: EvidenceEntity, right: EvidenceEntity): boolean {
  return left.namespace === right.namespace && left.name === right.name
}

export function finishParallelTool(
  state: ParallelEvidenceState,
  toolName: string,
  status: string,
  resultPreview: string,
  resultData: string,
  fallbackId?: string,
): ParallelEvidenceState {
  const { pendingTools, matched } = removeFirstPendingTool(state.pendingTools, toolName)
  const metadata = parseParallelResultMetadata(toolName, resultPreview)
  const existingCount = state.groups.reduce((total, group) => total + group.results.length, 0)
    + state.unassignedResults.length
  const result: ParallelEvidenceResult = {
    id: matched?.id || fallbackId || `parallel-result-${existingCount + 1}`,
    toolName,
    status: status === 'success' ? 'success' : 'error',
    resultPreview,
    resultData,
    dimension: metadata.dimension,
    ...(metadata.sourceSystem ? { sourceSystem: metadata.sourceSystem } : {}),
    ...(metadata.entity ? { entity: metadata.entity } : {}),
  }

  const matchingIndexes = metadata.entity
    ? state.groups.flatMap((group, index) => (
        group.entities.some(entity => entityMatches(entity, metadata.entity!)) ? [index] : []
      ))
    : []

  if (matchingIndexes.length !== 1) {
    return {
      ...state,
      pendingTools,
      unassignedResults: [...state.unassignedResults, result],
    }
  }

  const targetIndex = matchingIndexes[0]
  return {
    ...state,
    pendingTools,
    groups: state.groups.map((group, index) => (
      index === targetIndex
        ? { ...group, results: [...group.results, result] }
        : group
    )),
  }
}

export function completeParallelEvidence(
  state: ParallelEvidenceState,
): ParallelEvidenceState {
  return { ...state, status: 'complete' }
}

export function dimensionCounts(
  group: ParallelEvidenceGroup,
): Record<EvidenceDimension, number> {
  const counts: Record<EvidenceDimension, number> = {
    kubernetes: 0,
    metrics: 0,
    logging: 0,
    tracing: 0,
    topology: 0,
    other: 0,
  }
  for (const result of group.results) {
    counts[result.dimension] += 1
  }
  return counts
}
