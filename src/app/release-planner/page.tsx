"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { format, parseISO } from "date-fns";
import type { Release, ReleaseWorkItem } from "@/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { GripVertical, ListTodo } from "lucide-react";

const ACTIVE_RELEASE_STORAGE_KEY = "projectManager.releasePlanner.activeReleaseId";

interface SortableItemProps {
  id: number;
  children: React.ReactNode;
}

function SortableItem({ id, children }: SortableItemProps) {
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
    <div
      ref={setNodeRef}
      style={style}
      className="flex gap-3 group p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity flex items-center justify-center flex-shrink-0"
        title="Drag to reorder"
        style={{ width: "24px" }}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      {children}
    </div>
  );
}

export default function ReleaseTrackingPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [workItems, setWorkItems] = useState<ReleaseWorkItem[]>([]);
  const [workItemsLoading, setWorkItemsLoading] = useState(false);
  const [activeReleaseId, setActiveReleaseId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = window.localStorage.getItem(ACTIVE_RELEASE_STORAGE_KEY);
    if (!stored) return null;
    const parsed = Number(stored);
    return Number.isNaN(parsed) ? null : parsed;
  });
  const [newReleaseName, setNewReleaseName] = useState("");
  const [newReleaseStart, setNewReleaseStart] = useState("");
  const [newReleaseEnd, setNewReleaseEnd] = useState("");
  const [azureDevOpsOrganization, setAzureDevOpsOrganization] = useState("");
  const [azureDevOpsProject, setAzureDevOpsProject] = useState("");

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const sortedReleases = useMemo(() => {
    return [...releases].sort((a, b) =>
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
  const handleCreateRelease = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newReleaseName || !newReleaseStart || !newReleaseEnd) return;
    if (newReleaseEnd < newReleaseStart) {
      toast.error("End date must be after start date");
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newReleaseName.trim(),
          start_date: newReleaseStart,
          end_date: newReleaseEnd,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to create release");
      }

      const created = (await response.json()) as Release;
      await loadReleases();
      setActiveReleaseId(created.id);
      setNewReleaseName("");
      setNewReleaseStart("");
      setNewReleaseEnd("");
      setShowCreate(false);
      toast.success("Release created");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create release";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const handleReleaseChange = (value: string) => {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      setActiveReleaseId(parsed);
    }
  };

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

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 shrink-0">
        <div className="flex gap-3 items-center justify-between flex-wrap">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading releases...</div>
          ) : sortedReleases.length === 0 ? (
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">Release Planner</h1>
              <p className="text-sm text-muted-foreground">
                No releases yet. Create your first release to start planning.
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-3 items-center">
                <Select
                  value={activeRelease?.id ? String(activeRelease.id) : undefined}
                  onValueChange={handleReleaseChange}
                >
                  <SelectTrigger className="w-[180px] h-10">
                    <SelectValue placeholder="Select release" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedReleases.map((release) => (
                      <SelectItem key={release.id} value={String(release.id)}>
                        {release.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
                  <div className="text-center">
                    <h1 className="text-2xl font-semibold">
                      {activeRelease.name}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      {format(parseISO(activeRelease.start_date), "dd MMM yyyy")} –{" "}
                      {format(parseISO(activeRelease.end_date), "dd MMM yyyy")}
                    </p>
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
            </>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={() => setShowCreate(true)} size="sm" className="h-10">
              + New release
            </Button>
            {activeRelease && (
              <Button
                onClick={() => setShowImport(true)}
                size="sm"
                className="h-10"
                variant="outline"
              >
                Import user stories
              </Button>
            )}
          </div>
        </div>
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
                    <div className="space-y-3">
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

                        return (
                          <SortableItem key={item.id} id={item.id}>
                            <div className="flex items-center justify-center flex-shrink-0 w-5 h-5">
                              <ListTodo className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {item.external_id && (
                                  <Badge variant="outline" className="text-xs font-mono font-semibold">
                                    {workItemUrl ? (
                                      <a
                                        href={workItemUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 hover:underline"
                                      >
                                        {Math.floor(Number(item.external_id))}
                                      </a>
                                    ) : (
                                      Math.floor(Number(item.external_id))
                                    )}
                                  </Badge>
                                )}
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${
                                    item.state?.toLowerCase() === "done"
                                      ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800"
                                      : item.state?.toLowerCase() === "active"
                                      ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800"
                                      : "bg-muted text-muted-foreground border-border"
                                  }`}
                                >
                                  {item.state || "New"}
                                </Badge>
                                <span className="text-sm font-medium text-foreground">
                                  {item.title}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Created: {format(new Date(item.created_at), "dd MMM yyyy")}
                              </div>
                              {item.tags && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {item.tags.split(';').map((tag, idx) => (
                                    tag.trim() && (
                                      <Badge key={idx} variant="outline" className="text-xs">
                                        {tag.trim()}
                                      </Badge>
                                    )
                                  ))}
                                </div>
                              )}
                            </div>
                          </SortableItem>
                        );
                      })}
                    </div>
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
                Create your first release to start planning.
              </p>
              <Button onClick={() => setShowCreate(true)} size="sm">
                Create release
              </Button>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create release</DialogTitle>
              <DialogDescription>
                Set a name and a date range for this release.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateRelease} className="space-y-4">
              <div className="space-y-2">        <Label htmlFor="release-name">Release name</Label>
                <Input
                  id="release-name"
                  value={newReleaseName}
                  onChange={(event) => setNewReleaseName(event.target.value)}
                  placeholder="e.g., Q2 Launch"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="release-start">Start date</Label>
                  <Input
                    id="release-start"
                    type="date"
                    value={newReleaseStart}
                    onChange={(event) => setNewReleaseStart(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="release-end">End date</Label>
                  <Input
                    id="release-end"
                    type="date"
                    value={newReleaseEnd}
                    onChange={(event) => setNewReleaseEnd(event.target.value)}
                    min={newReleaseStart}
                    required
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowCreate(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create release"}
                </Button>
              </DialogFooter>
            </form>
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
