import type {
  EvidenceDimension,
  EvidenceEntity,
  ParallelEvidenceGroup,
  ParallelEvidenceResult,
  ParallelEvidenceState,
  ParallelEvidenceStreamContext,
  ParallelToolEventMetadata,
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

export function parseParallelEvidenceStreamContext(
  value: unknown,
): ParallelEvidenceStreamContext | undefined {
  if (!isRecord(value)) return undefined
  const groupId = String(value.group_id || value.groupId || '').trim()
  if (!groupId) return undefined
  const contractVersion = String(
    value.contract_version || value.contractVersion || '',
  ).trim()
  const sourceSystem = String(value.source_system || value.sourceSystem || '').trim()
  const entity = normalizeEntity(value.entity)
  const rawDimension = value.dimension
  const hasDimension = String(rawDimension || '').trim().length > 0

  return {
    groupId,
    ...(contractVersion ? { contractVersion } : {}),
    ...(entity ? { entity } : {}),
    ...(hasDimension ? { dimension: normalizeDimension(rawDimension, '') } : {}),
    ...(sourceSystem ? { sourceSystem } : {}),
  }
}

export function resolveParallelResultData(event: UnknownRecord): string {
  if (typeof event.result === 'string') return event.result
  if (event.result !== undefined) return JSON.stringify(event.result, null, 2)
  return JSON.stringify(event, null, 2)
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
  metadata?: ParallelToolEventMetadata,
): { pendingTools: ToolCall[]; matched?: ToolCall } {
  const callId = String(metadata?.toolCallId || '').trim()
  const groupId = String(metadata?.evidenceContext?.groupId || '').trim()
  let index = -1
  if (callId) {
    const callIndexes = pendingTools.flatMap((tool, candidateIndex) => (
      tool.backendCallId === callId ? [candidateIndex] : []
    ))
    if (groupId) {
      index = callIndexes.find(candidateIndex => (
        pendingTools[candidateIndex]?.evidenceContext?.groupId === groupId
      )) ?? -1
      if (index < 0 && callIndexes.length === 1) {
        const onlyIndex = callIndexes[0]!
        if (!pendingTools[onlyIndex]?.evidenceContext?.groupId) index = onlyIndex
      }
    } else if (callIndexes.length === 1) {
      index = callIndexes[0]!
    }
  } else {
    index = pendingTools.findIndex(tool => tool.toolName === toolName)
  }
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
  return left.kind.toLowerCase() === right.kind.toLowerCase()
    && left.namespace === right.namespace
    && left.name === right.name
}

export function shouldRouteOnlyToParallelBoard(
  nodeId: string,
  evidenceContext: ParallelEvidenceStreamContext | undefined,
  mirrored: boolean,
): boolean {
  return mirrored && (nodeId === 'parallel_evidence' || Boolean(evidenceContext))
}

export function finishParallelTool(
  state: ParallelEvidenceState,
  toolName: string,
  status: string,
  resultPreview: string,
  resultData: string,
  fallbackId?: string,
  eventMetadata?: ParallelToolEventMetadata,
): ParallelEvidenceState {
  const { pendingTools, matched } = removeFirstPendingTool(
    state.pendingTools,
    toolName,
    eventMetadata,
  )
  const previewMetadata = parseParallelResultMetadata(toolName, resultPreview)
  const context = eventMetadata?.evidenceContext
  const entity = context ? context.entity : previewMetadata.entity
  const dimension = context?.dimension || previewMetadata.dimension
  const sourceSystem = context?.sourceSystem || previewMetadata.sourceSystem
  let targetIndex = -1
  if (context?.groupId) {
    targetIndex = state.groups.findIndex(group => group.groupId === context.groupId)
  } else if (entity) {
    const matchingIndexes = state.groups.flatMap((group, index) => (
      group.entities.some(candidate => entityMatches(candidate, entity)) ? [index] : []
    ))
    targetIndex = matchingIndexes.length === 1 ? matchingIndexes[0]! : -1
  }

  const targetGroup = targetIndex >= 0 ? state.groups[targetIndex] : undefined
  const exactEntity = entity && targetGroup
    && targetGroup.entities.some(candidate => entityMatches(candidate, entity))
    ? entity
    : (!context?.groupId ? entity : undefined)
  const existingCount = state.groups.reduce((total, group) => total + group.results.length, 0)
    + state.unassignedResults.length
  const result: ParallelEvidenceResult = {
    id: matched?.id || fallbackId || `parallel-result-${existingCount + 1}`,
    toolName,
    status: status === 'success' && eventMetadata?.semanticSuccess !== false
      ? 'success'
      : 'error',
    resultPreview,
    resultData,
    dimension,
    scope: exactEntity ? 'entity' : 'group',
    ...(context?.groupId ? { groupId: context.groupId } : {}),
    ...(sourceSystem ? { sourceSystem } : {}),
    ...(exactEntity ? { entity: exactEntity } : {}),
    ...(eventMetadata?.rawRef ? { rawRef: eventMetadata.rawRef } : {}),
    ...(eventMetadata?.structuredRef ? { structuredRef: eventMetadata.structuredRef } : {}),
    ...(eventMetadata?.summaryRef ? { summaryRef: eventMetadata.summaryRef } : {}),
  }

  if (targetIndex < 0) {
    return {
      ...state,
      pendingTools,
      unassignedResults: [...state.unassignedResults, result],
    }
  }

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
