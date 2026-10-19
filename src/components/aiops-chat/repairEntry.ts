/** Where a message's repair workspace comes from, independent of how it was started. */

export interface RepairRecordRef {
  run_id: string
  kind: 'diagnosis' | 'plan'
  source_run_id?: string | null
  repairable?: boolean
}

export interface RepairBatchRef {
  batch_id: string
  diagnosis_run_id: string
}

export interface RepairEntryInput {
  repairRecord?: RepairRecordRef
  repairBatchId?: string
  repairBatchDiagnosisId?: string
}

export interface RepairEntry {
  /** Diagnosis the workspace plans from; absent means no workspace for this message. */
  diagnosisId?: string
  batchId?: string
  /** The diagnosis exists but every group is healthy or already recovered. */
  nothingToRepair: boolean
}

/**
 * Two entries open the same per-group workspace: the button under a diagnosis report,
 * and a chat repair request the backend dispatched to a batch (``final.repair_batch``).
 */
export function repairEntry(message: RepairEntryInput): RepairEntry {
  if (message.repairBatchDiagnosisId) {
    return {
      diagnosisId: message.repairBatchDiagnosisId,
      batchId: message.repairBatchId,
      nothingToRepair: false,
    }
  }
  const record = message.repairRecord
  if (record?.kind !== 'diagnosis') return { nothingToRepair: false }
  if (record.repairable === false) return { nothingToRepair: true }
  return { diagnosisId: record.run_id, batchId: message.repairBatchId, nothingToRepair: false }
}
