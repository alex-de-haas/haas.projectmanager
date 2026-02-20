import { WorkItemTrackingApi } from "azure-devops-node-api/WorkItemTrackingApi";
import db from "@/lib/db";

export interface ChildWorkItemSnapshot {
  id: number;
  parentId: number;
  title: string;
  type: string;
  state: string;
  assignedTo?: string | null;
}

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const uniqueParentIds = (parentIds: number[]): number[] =>
  Array.from(
    new Set(
      parentIds
        .map((value) => parsePositiveInt(value))
        .filter((value): value is number => value !== null)
    )
  );

export const fetchChildWorkItemsForParentIds = async (
  witApi: WorkItemTrackingApi,
  project: string,
  parentIds: number[]
): Promise<ChildWorkItemSnapshot[]> => {
  const uniqueIds = uniqueParentIds(parentIds);
  if (uniqueIds.length === 0) return [];

  const parentBatchSize = 100;
  const workItemBatchSize = 200;
  const allItems: ChildWorkItemSnapshot[] = [];

  for (let i = 0; i < uniqueIds.length; i += parentBatchSize) {
    const parentBatch = uniqueIds.slice(i, i + parentBatchSize);
    const wiql = {
      query: `
        SELECT [System.Id]
        FROM WorkItems
        WHERE [System.Parent] IN (${parentBatch.join(",")})
          AND ([System.WorkItemType] = 'Task' OR [System.WorkItemType] = 'Bug')
          AND [System.State] <> 'Removed'
        ORDER BY [System.ChangedDate] DESC
      `,
    };

    const queryResult = await witApi.queryByWiql(wiql, { project });
    const ids =
      queryResult?.workItems?.map((wi) => wi.id).filter((id): id is number => !!id) ??
      [];

    if (ids.length === 0) continue;

    for (let j = 0; j < ids.length; j += workItemBatchSize) {
      const idBatch = ids.slice(j, j + workItemBatchSize);
      const workItems = await witApi.getWorkItems(
        idBatch,
        [
          "System.Id",
          "System.Parent",
          "System.Title",
          "System.WorkItemType",
          "System.State",
          "System.AssignedTo",
        ],
        undefined,
        undefined,
        undefined
      );

      for (const workItem of workItems ?? []) {
        if (!workItem.id || !workItem.fields) continue;
        const parentId = parsePositiveInt(workItem.fields["System.Parent"]);
        if (!parentId) continue;

        const assignedField = workItem.fields["System.AssignedTo"] as
          | string
          | { displayName?: string; uniqueName?: string }
          | undefined;
        const assignedTo =
          typeof assignedField === "string"
            ? assignedField
            : assignedField?.displayName || assignedField?.uniqueName || null;

        allItems.push({
          id: workItem.id,
          parentId,
          title: String(workItem.fields["System.Title"] ?? "Untitled"),
          type: String(workItem.fields["System.WorkItemType"] ?? "Unknown"),
          state: String(workItem.fields["System.State"] ?? "Unknown"),
          assignedTo,
        });
      }
    }
  }

  return allItems;
};

export const syncChildWorkItemsSnapshot = (params: {
  projectId: number;
  parentIds: number[];
  items: ChildWorkItemSnapshot[];
}): { parents: number; items: number; deleted: number } => {
  const { projectId } = params;
  const parentIds = uniqueParentIds(params.parentIds);

  if (parentIds.length === 0) {
    return { parents: 0, items: 0, deleted: 0 };
  }

  const parentIdSet = new Set(parentIds);
  const itemsById = new Map<number, ChildWorkItemSnapshot>();
  for (const item of params.items) {
    const itemId = parsePositiveInt(item.id);
    const parentId = parsePositiveInt(item.parentId);
    if (!itemId || !parentId || !parentIdSet.has(parentId)) {
      continue;
    }
    itemsById.set(itemId, {
      ...item,
      id: itemId,
      parentId,
      title: item.title || "Untitled",
      type: item.type || "Unknown",
      state: item.state || "Unknown",
      assignedTo: item.assignedTo ?? null,
    });
  }

  const uniqueItems = Array.from(itemsById.values());

  const insertStmt = db.prepare(`
    INSERT INTO release_work_item_children (
      project_id,
      parent_external_id,
      child_external_id,
      title,
      work_item_type,
      state,
      assigned_to,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(project_id, child_external_id) DO UPDATE SET
      parent_external_id = excluded.parent_external_id,
      title = excluded.title,
      work_item_type = excluded.work_item_type,
      state = excluded.state,
      assigned_to = excluded.assigned_to,
      updated_at = CURRENT_TIMESTAMP
  `);

  const syncTransaction = db.transaction(
    (transactionParentIds: number[], transactionItems: ChildWorkItemSnapshot[]) => {
      let deleted = 0;
      const deleteBatchSize = 200;

      for (let i = 0; i < transactionParentIds.length; i += deleteBatchSize) {
        const batch = transactionParentIds.slice(i, i + deleteBatchSize);
        const placeholders = batch.map(() => "?").join(", ");
        const deleteResult = db
          .prepare(
            `
            DELETE FROM release_work_item_children
            WHERE project_id = ?
              AND parent_external_id IN (${placeholders})
          `
          )
          .run(projectId, ...batch);
        deleted += deleteResult.changes;
      }

      for (const item of transactionItems) {
        insertStmt.run(
          projectId,
          item.parentId,
          item.id,
          item.title,
          item.type,
          item.state,
          item.assignedTo ?? null
        );
      }

      return deleted;
    }
  );

  const deleted = syncTransaction(parentIds, uniqueItems);

  return {
    parents: parentIds.length,
    items: uniqueItems.length,
    deleted,
  };
};
