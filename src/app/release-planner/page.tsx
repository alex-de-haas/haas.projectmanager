"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { format } from "date-fns";
import type { Release, ReleaseWorkItem } from "@/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import ReleaseImportModal from "@/features/release-planner/components/ReleaseImportModal";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListTodo, MoreVertical } from "lucide-react";

type ChildDiscipline = "backend" | "frontend" | "design";

const CHILD_TASK_OPTIONS: Array<{
  value: ChildDiscipline;
  label: string;
  prefix: string;
}> = [
  { value: "backend", label: "Backend", prefix: "BE:" },
  { value: "frontend", label: "Frontend", prefix: "FE:" },
  { value: "design", label: "Design", prefix: "Design:" },
];

const ACTIVE_RELEASE_STORAGE_KEY = "projectManager.releasePlanner.activeReleaseId";

interface SortableRowProps {
  id: number;
  children: React.ReactNode;
  rowClassName: string;
  dragHandleBgClassName: string;
}

function SortableRow({
  id,
  children,
  rowClassName,
  dragHandleBgClassName,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className={rowClassName}>
      <td className={`py-2 px-3 ${dragHandleBgClassName}`} style={{ width: "40px" }}>
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
      </td>
      {children}
    </tr>
  );
}

export default function ReleaseTrackingPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [workItems, setWorkItems] = useState<ReleaseWorkItem[]>([]);
  const [workItemsLoading, setWorkItemsLoading] = useState(false);
  const [activeReleaseId, setActiveReleaseId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem(ACTIVE_RELEASE_STORAGE_KEY);
    if (!stored) return null;
    const parsed = Number(stored);
    return Number.isNaN(parsed) ? null : parsed;
  });
  const [azureDevOpsOrganization, setAzureDevOpsOrganization] = useState("");
  const [azureDevOpsProject, setAzureDevOpsProject] = useState("");
  const [moveWorkItemDialogOpen, setMoveWorkItemDialogOpen] = useState(false);
  const [selectedWorkItemToMove, setSelectedWorkItemToMove] = useState<ReleaseWorkItem | null>(null);
  const [selectedTargetReleaseId, setSelectedTargetReleaseId] = useState<string>("");
  const [showCreateChild, setShowCreateChild] = useState<{
    workItemId: number;
    workItemTitle: string;
  } | null>(null);
  const [childDisciplines, setChildDisciplines] = useState<Set<ChildDiscipline>>(
    () => new Set()
  );
  const [childSubmitting, setChildSubmitting] = useState(false);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sortedReleases = useMemo(() => {
    return [...releases].sort(
      (a, b) =>
        (a.display_order ?? Number.MAX_SAFE_INTEGER) -
          (b.display_order ?? Number.MAX_SAFE_INTEGER) ||
        a.start_date.localeCompare(b.start_date)
    );
  }, [releases]);

  const activeReleaseIndex = useMemo(() => {
    if (sortedReleases.length === 0) return -1;
    if (activeReleaseId === null) return sortedReleases.length - 1;
    const index = sortedReleases.findIndex(
      (release) => release.id === activeReleaseId
    );
    return index === -1 ? sortedReleases.length - 1 : index;
  }, [sortedReleases, activeReleaseId]);

  const activeRelease = useMemo(() => {
    if (activeReleaseIndex < 0) return null;
    return sortedReleases[activeReleaseIndex] ?? null;
  }, [sortedReleases, activeReleaseIndex]);

  const moveTargetReleases = useMemo(() => {
    return sortedReleases.filter(
      (release) => release.id !== activeReleaseId && release.status !== "completed"
    );
  }, [sortedReleases, activeReleaseId]);

  const loadReleases = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/releases");
      if (!response.ok) throw new Error("Failed to fetch releases");
      const data = (await response.json()) as Release[];
      setReleases(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load releases");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReleases();
  }, []);

  const loadAzureDevOpsSettings = async () => {
    try {
      const response = await fetch("/api/settings?key=azure_devops");
      if (response.ok) {
        const data = await response.json();
        if (data.value) {
          const settings =
            typeof data.value === "string"
              ? JSON.parse(data.value)
              : data.value;
          setAzureDevOpsOrganization(settings.organization || "");
          setAzureDevOpsProject(settings.project || "");
        }
      }
    } catch (err) {
      console.error("Failed to load Azure DevOps settings:", err);
    }
  };

  useEffect(() => {
    loadAzureDevOpsSettings();
  }, []);

  useEffect(() => {
    if (!activeReleaseId) {
      setWorkItems([]);
      return;
    }

    let cancelled = false;
    const loadWorkItems = async () => {
      setWorkItemsLoading(true);
      try {
        const response = await fetch(
          `/api/releases/work-items?releaseId=${activeReleaseId}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch release work items");
        }
        const data = (await response.json()) as ReleaseWorkItem[];
        if (!cancelled) {
          setWorkItems(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error("Failed to load release work items");
        }
      } finally {
        if (!cancelled) {
          setWorkItemsLoading(false);
        }
      }
    };

    loadWorkItems();

    return () => {
      cancelled = true;
    };
  }, [activeReleaseId]);

  useEffect(() => {
    if (sortedReleases.length === 0) return;
    if (activeReleaseIndex === -1) return;
    const release = sortedReleases[activeReleaseIndex];
    if (!release) return;
    if (release.id !== activeReleaseId) {
      setActiveReleaseId(release.id);
    }
  }, [sortedReleases, activeReleaseIndex, activeReleaseId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeReleaseId === null) return;
    window.localStorage.setItem(
      ACTIVE_RELEASE_STORAGE_KEY,
      String(activeReleaseId)
    );
  }, [activeReleaseId]);
  const loadWorkItemsForRelease = useCallback(async (releaseId: number) => {
    setWorkItemsLoading(true);
    try {
      const response = await fetch(`/api/releases/work-items?releaseId=${releaseId}`);
      if (!response.ok) throw new Error("Failed to fetch work items");
      const data = (await response.json()) as ReleaseWorkItem[];
      setWorkItems(data);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load release work items");
    } finally {
      setWorkItemsLoading(false);
    }
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setWorkItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const newItems = arrayMove(items, oldIndex, newIndex);

        // Update display_order in database
        const workItemOrders = newItems.map((item, index) => ({
          id: item.id,
          order: index,
        }));

        fetch("/api/releases/work-items/reorder", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workItemOrders }),
        }).catch((err) => {
          console.error("Failed to update work item order:", err);
          // Revert on error by fetching fresh data
          if (activeReleaseId) {
            loadWorkItemsForRelease(activeReleaseId);
          }
        });

        return newItems;
      });
    }
  }, [activeReleaseId, loadWorkItemsForRelease]);
  const handlePrevRelease = () => {
    if (activeReleaseIndex <= 0) return;
    const prev = sortedReleases[activeReleaseIndex - 1];
    if (prev) setActiveReleaseId(prev.id);
  };

  const handleNextRelease = () => {
    if (activeReleaseIndex < 0) return;
    if (activeReleaseIndex >= sortedReleases.length - 1) return;
    const next = sortedReleases[activeReleaseIndex + 1];
    if (next) setActiveReleaseId(next.id);
  };

  const handleMoveWorkItem = async () => {
    if (!selectedWorkItemToMove || !selectedTargetReleaseId) return;

    try {
      const response = await fetch(`/api/releases/work-items/${selectedWorkItemToMove.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          release_id: Number(selectedTargetReleaseId),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to move work item");
      }

      toast.success("Work item moved successfully");
      setMoveWorkItemDialogOpen(false);
      setSelectedWorkItemToMove(null);
      setSelectedTargetReleaseId("");

      // Refresh work items for current release
      if (activeReleaseId) {
        loadWorkItemsForRelease(activeReleaseId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to move work item";
      toast.error(message);
    }
  };

  const handleRemoveWorkItem = async (workItemId: number) => {
    try {
      const response = await fetch(`/api/releases/work-items?id=${workItemId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to remove work item");
      }

      toast.success("Work item removed from release");

      // Refresh work items for current release
      if (activeReleaseId) {
        loadWorkItemsForRelease(activeReleaseId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove work item";
      toast.error(message);
    }
  };

  const handleWorkItemClick = (workItem: ReleaseWorkItem) => {
    if (workItem.external_source === "azure_devops" && workItem.external_id && azureDevOpsOrganization && azureDevOpsProject) {
      const url = `https://dev.azure.com/${azureDevOpsOrganization}/${azureDevOpsProject}/_workitems/edit/${Math.floor(Number(workItem.external_id))}`;
      window.open(url, "_blank");
    }
  };

  const handleCreateChildTask = useCallback(async () => {
    if (!showCreateChild) return;

    if (childDisciplines.size === 0) {
      toast.error("Select at least one discipline for the child task");
      return;
    }

    setChildSubmitting(true);
    try {
      const selectedOptions = CHILD_TASK_OPTIONS.filter((option) =>
        childDisciplines.has(option.value)
      );

      if (selectedOptions.length === 0) {
        throw new Error("Invalid disciplines selected");
      }

      const responses = await Promise.all(
        selectedOptions.map((option) =>
          fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: `${option.prefix} ${showCreateChild.workItemTitle}`,
              type: "task",
            }),
          })
        )
      );

      const failedResponse = responses.find((response) => !response.ok);
      if (failedResponse) {
        const errorData = await failedResponse.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create child task");
      }

      toast.success("Child task created");
      setShowCreateChild(null);
      setChildDisciplines(new Set());
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to create child task");
    } finally {
      setChildSubmitting(false);
    }
  }, [childDisciplines, showCreateChild]);

  const handleRefresh = async () => {
    setIsRefreshing(true);

    try {
      const refreshResponse = await fetch("/api/azure-devops/refresh", {
        method: "POST",
      });

      if (refreshResponse.ok) {
        const result = await refreshResponse.json();

        if (result.updated > 0) {
          toast.success(`Successfully updated ${result.updated} task(s) from Azure DevOps`);
        } else if (result.skipped > 0) {
          toast.info(`All ${result.skipped} imported task(s) are up to date`);
        }
      } else if (refreshResponse.status === 400) {
        console.log("Azure DevOps settings not configured, skipping refresh");
      } else {
        const errorData = await refreshResponse.json();
        toast.error(errorData.error || "Failed to refresh Azure DevOps tasks");
      }
    } catch (err) {
      console.error("Error refreshing Azure DevOps tasks:", err);
      toast.error("An error occurred while refreshing tasks");
    } finally {
      if (activeReleaseId) {
        await loadWorkItemsForRelease(activeReleaseId);
      }
      setIsRefreshing(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 shrink-0">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading releases...</div>
        ) : sortedReleases.length === 0 ? (
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Release Planner</h1>
            <p className="text-sm text-muted-foreground">
              No releases yet. Create one in Settings, Releases tab to start planning.
            </p>
          </div>
        ) : (
          <div className="flex gap-3 items-center justify-center relative">
            <div className="flex gap-3 items-center">
              <Button
                onClick={handlePrevRelease}
                variant="outline"
                size="icon"
                className="h-10 w-10"
                disabled={activeReleaseIndex <= 0}
              >
                ←
              </Button>
              {activeRelease && (
                <div className="text-center min-w-[200px]">
                  <div className="flex items-center justify-center gap-2">
                    <h1 className="text-2xl font-semibold">
                      {activeRelease.name}
                    </h1>
                    {activeRelease.status === "completed" && (
                      <Badge variant="secondary">Completed</Badge>
                    )}
                  </div>
                </div>
              )}
              <Button
                onClick={handleNextRelease}
                variant="outline"
                size="icon"
                className="h-10 w-10"
                disabled={activeReleaseIndex >= sortedReleases.length - 1}
              >
                →
              </Button>
            </div>

            <div className="flex items-center gap-3 absolute right-0">
              {activeRelease && (
                <>
                  <Button
                    onClick={() => setShowImport(true)}
                    size="sm"
                    className="h-10"
                    variant="outline"
                  >
                    Import user stories
                  </Button>
                  <Button
                    onClick={handleRefresh}
                    size="sm"
                    className="h-10"
                    variant="outline"
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {activeRelease && (
          <div className="overflow-auto h-full">
            <div className="p-6 space-y-3">
              {workItemsLoading ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Loading work items...
                </div>
              ) : workItems.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No work items yet. Import user stories to start planning.
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={workItems.map((item) => item.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-muted border-b border-border sticky top-0 z-10">
                          <th className="p-3 sticky left-0 bg-muted z-10" style={{ width: "40px" }}>
                            {/* Drag handle column */}
                          </th>
                          <th className="p-3 text-left font-normal text-muted-foreground text-sm sticky left-[40px] bg-muted z-10" style={{ minWidth: "240px" }}>
                            Work item
                          </th>
                          <th className="p-3 text-left font-normal text-muted-foreground text-sm" style={{ width: "240px" }}>
                            Tags
                          </th>
                          <th className="p-3 text-left font-normal text-muted-foreground text-sm" style={{ width: "160px" }}>
                            Created
                          </th>
                          <th className="p-3 text-right font-normal text-muted-foreground text-sm" style={{ width: "80px" }}>
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {workItems.map((item) => {
                          const getWorkItemUrl = () => {
                            if (
                              item.external_source === "azure_devops" &&
                              item.external_id &&
                              azureDevOpsOrganization &&
                              azureDevOpsProject
                            ) {
                              return `https://dev.azure.com/${azureDevOpsOrganization}/${azureDevOpsProject}/_workitems/edit/${Math.floor(Number(item.external_id))}`;
                            }
                            return null;
                          };

                          const workItemUrl = getWorkItemUrl();
                          const itemState = item.state?.toLowerCase();

                          const getRowClass = () => {
                            if (itemState === "done" || itemState === "resolved" || itemState === "closed") {
                              return "group border-b border-border bg-green-50 hover:bg-green-100 dark:bg-green-950 dark:hover:bg-green-900";
                            }
                            if (itemState === "active") {
                              return "group border-b border-border bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900";
                            }
                            return "group border-b border-border hover:bg-muted dark:hover:bg-muted";
                          };

                          const getStickyBgClass = () => {
                            if (itemState === "done" || itemState === "resolved" || itemState === "closed") {
                              return "py-2 px-3 sticky left-[40px] bg-green-50 group-hover:bg-green-100 dark:bg-green-950 dark:group-hover:bg-green-900 z-10";
                            }
                            if (itemState === "active") {
                              return "py-2 px-3 sticky left-[40px] bg-blue-50 group-hover:bg-blue-100 dark:bg-blue-950 dark:group-hover:bg-blue-900 z-10";
                            }
                            return "py-2 px-3 sticky left-[40px] bg-background dark:bg-card group-hover:bg-muted dark:group-hover:bg-muted z-10";
                          };

                          const getDragHandleBgClass = () => {
                            if (itemState === "done" || itemState === "resolved" || itemState === "closed") {
                              return "sticky left-0 bg-green-50 group-hover:bg-green-100 dark:bg-green-950 dark:group-hover:bg-green-900 z-10";
                            }
                            if (itemState === "active") {
                              return "sticky left-0 bg-blue-50 group-hover:bg-blue-100 dark:bg-blue-950 dark:group-hover:bg-blue-900 z-10";
                            }
                            return "sticky left-0 bg-background dark:bg-card group-hover:bg-muted dark:group-hover:bg-muted z-10";
                          };

                          return (
                            <SortableRow
                              key={item.id}
                              id={item.id}
                              rowClassName={getRowClass()}
                              dragHandleBgClassName={getDragHandleBgClass()}
                            >
                              <td
                                className={getStickyBgClass()}
                                style={{ minWidth: "240px" }}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="flex items-center justify-center flex-shrink-0 w-5 h-5">
                                    <ListTodo className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                                  </div>
                                  {item.external_id && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs font-mono font-semibold"
                                    >
                                      {Math.floor(Number(item.external_id))}
                                    </Badge>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${
                                      itemState === "done" || itemState === "resolved" || itemState === "closed"
                                        ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800"
                                        : itemState === "active"
                                        ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800"
                                        : "bg-muted text-muted-foreground border-border"
                                    }`}
                                  >
                                    {item.state || "New"}
                                  </Badge>
                                  <div className="truncate text-sm font-medium min-w-0" title={item.title}>
                                    {item.external_source === "azure_devops" && item.external_id ? (
                                      <button
                                        onClick={() => handleWorkItemClick(item)}
                                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline cursor-pointer text-left truncate block w-full"
                                        title={`${item.title} - Open in Azure DevOps`}
                                      >
                                        {item.title}
                                      </button>
                                    ) : (
                                      <span className="text-foreground">{item.title}</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2 px-3">
                                {item.tags ? (
                                  <div className="flex flex-wrap gap-1">
                                    {item.tags.split(";").map((tag, idx) => (
                                      tag.trim() && (
                                        <Badge key={idx} variant="outline" className="text-xs">
                                          {tag.trim()}
                                        </Badge>
                                      )
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">-</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-xs text-muted-foreground">
                                {item.created_at
                                  ? format(new Date(item.created_at), "dd MMM yyyy")
                                  : "-"}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                                      title="Actions"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem
                                      disabled={moveTargetReleases.length === 0}
                                      onClick={() => {
                                        setSelectedWorkItemToMove(item);
                                        setSelectedTargetReleaseId("");
                                        setMoveWorkItemDialogOpen(true);
                                      }}
                                    >
                                      Move to release
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => {
                                        setChildDisciplines(new Set());
                                        setShowCreateChild({
                                          workItemId: item.id,
                                          workItemTitle: item.title,
                                        });
                                      }}
                                    >
                                      Create child task
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleRemoveWorkItem(item.id)}
                                      className="text-red-600 dark:text-red-400"
                                    >
                                      Remove from release
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </SortableRow>
                          );
                        })}
                      </tbody>
                    </table>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        )}
        {!activeRelease && !loading && sortedReleases.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <p className="text-muted-foreground">
                Create your first release in Settings, Releases tab.
              </p>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={!!showCreateChild}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateChild(null);
            setChildDisciplines(new Set());
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create Child Task</DialogTitle>
            <DialogDescription>
              Choose one or more disciplines for the child task. The title will be prefixed accordingly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {CHILD_TASK_OPTIONS.map((option) => {
              const isSelected = childDisciplines.has(option.value);
              const checkboxId = `release-child-discipline-${option.value}`;
              return (
                <label
                  key={option.value}
                  htmlFor={checkboxId}
                  className={
                    "flex items-start gap-3 rounded-md border p-3 transition-colors cursor-pointer" +
                    (isSelected ? " bg-muted/60" : " hover:bg-muted/30")
                  }
                >
                  <Checkbox
                    id={checkboxId}
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      setChildDisciplines((prev) => {
                        const next = new Set(prev);
                        if (checked) {
                          next.add(option.value);
                        } else {
                          next.delete(option.value);
                        }
                        return next;
                      });
                    }}
                  />
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{option.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {option.prefix} {showCreateChild?.workItemTitle}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowCreateChild(null);
                setChildDisciplines(new Set());
              }}
              disabled={childSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateChildTask}
              disabled={childDisciplines.size === 0 || childSubmitting}
            >
              {childSubmitting ? "Creating..." : "Create Child Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {moveWorkItemDialogOpen && (
        <Dialog open={moveWorkItemDialogOpen} onOpenChange={setMoveWorkItemDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Move work item</DialogTitle>
              <DialogDescription>
                Select the release to move this work item to.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Work item</Label>
                <div className="text-sm font-medium">{selectedWorkItemToMove?.title}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-release">Target release</Label>
                <Select value={selectedTargetReleaseId} onValueChange={setSelectedTargetReleaseId}>
                  <SelectTrigger id="target-release">
                    <SelectValue placeholder="Select a release" />
                  </SelectTrigger>
                  <SelectContent>
                    {moveTargetReleases.map((release) => (
                        <SelectItem key={release.id} value={String(release.id)}>
                          {release.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {moveTargetReleases.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No active target releases available.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setMoveWorkItemDialogOpen(false);
                  setSelectedWorkItemToMove(null);
                  setSelectedTargetReleaseId("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleMoveWorkItem}
                disabled={!selectedTargetReleaseId}
              >
                Move
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {showImport && activeRelease && (
        <ReleaseImportModal
          releaseId={activeRelease.id}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            if (activeReleaseId) {
              fetch(`/api/releases/work-items?releaseId=${activeReleaseId}`)
                .then((response) => response.json())
                .then((data: ReleaseWorkItem[]) => setWorkItems(data))
                .catch((err) => {
                  console.error(err);
                  toast.error("Failed to refresh work items");
                });
            }
          }}
        />
      )}
    </div>
  );
}
