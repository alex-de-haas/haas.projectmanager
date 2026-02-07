"use client";

import { useEffect, useState } from "react";
import type { AzureDevOpsWorkItem } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

interface ReleaseImportModalProps {
  releaseId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReleaseImportModal({
  releaseId,
  onClose,
  onSuccess,
}: ReleaseImportModalProps) {
  const [workItems, setWorkItems] = useState<AzureDevOpsWorkItem[]>([]);
  const [filteredWorkItems, setFilteredWorkItems] = useState<
    AzureDevOpsWorkItem[]
  >([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">(
    "info"
  );

  useEffect(() => {
    fetchWorkItems();
  }, []);

  useEffect(() => {
    if (filterText.trim() === "") {
      setFilteredWorkItems(workItems);
    } else {
      const searchText = filterText.toLowerCase();
      const isNumericSearch = /^\d+$/.test(filterText.trim());
      
      // If searching by number, fetch including that specific ID
      if (isNumericSearch) {
        const searchId = Number(filterText.trim());
        fetchWorkItems(searchId);
      } else {
        const filtered = workItems.filter(
          (item) =>
            item.id.toString().includes(searchText) ||
            item.title.toLowerCase().includes(searchText)
        );
        setFilteredWorkItems(filtered);
      }
    }
  }, [filterText, workItems]);

  const fetchWorkItems = async (specificId?: number) => {
    try {
      setLoading(true);
      let url = `/api/azure-devops/user-stories?releaseId=${releaseId}`;
      if (specificId) {
        url += `&specificId=${specificId}`;
      }
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        setWorkItems(data.workItems || []);
        setFilteredWorkItems(data.workItems || []);
      } else {
        setMessage(
          `Error: Failed to fetch user stories: ${data.error || "Unknown error"}`
        );
        setMessageType("error");
      }
    } catch (err) {
      setMessage("Error: Failed to fetch user stories: Network error");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredWorkItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredWorkItems.map((item) => item.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) {
      setMessage("Please select at least one user story to import");
      setMessageType("error");
      return;
    }

    setImporting(true);
    setMessage("Importing selected user stories...");
    setMessageType("info");

    try {
      const response = await fetch("/api/releases/work-items/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releaseId,
          workItemIds: Array.from(selectedIds),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(
          `Success: Imported ${data.imported} user story(s)${
            data.skipped > 0
              ? `, skipped ${data.skipped} (already exists)`
              : ""
          }`
        );
        setMessageType("success");
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        setMessage(`Error: Import failed: ${data.error || "Unknown error"}`);
        setMessageType("error");
      }
    } catch (err) {
      setMessage("Error: Import failed: Network error");
      setMessageType("error");
    } finally {
      setImporting(false);
    }
  };

  const allSelected =
    filteredWorkItems.length > 0 &&
    selectedIds.size === filteredWorkItems.length;
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < filteredWorkItems.length;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Import User Stories</DialogTitle>
          <DialogDescription>
            Select Azure DevOps user stories to add to this release.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="filter">Search by ID or Title</Label>
            <Input
              id="filter"
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter by ID or title..."
              disabled={loading || importing}
            />
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : filteredWorkItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {workItems.length === 0
                ? "No user stories available to import"
                : "No user stories match your filter"}
            </div>
          ) : (
            <div className="border rounded-md max-h-[400px] overflow-y-auto">
              <table className="w-full">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="p-2 text-left w-12">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={toggleSelectAll}
                        className="h-4 w-4"
                        disabled={importing}
                      />
                    </th>
                    <th className="p-2 text-left w-20">ID</th>
                    <th className="p-2 text-left">Title</th>
                    <th className="p-2 text-left w-24">Type</th>
                    <th className="p-2 text-left w-24">State</th>
                    <th className="p-2 text-left w-32">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWorkItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-t hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleSelect(item.id)}
                    >
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="h-4 w-4"
                          disabled={importing}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="p-2 font-mono text-sm">{Math.floor(item.id)}</td>
                      <td className="p-2">{item.title}</td>
                      <td className="p-2">
                        <Badge variant="outline">{item.type}</Badge>
                      </td>
                      <td className="p-2">
                        <Badge variant="secondary">{item.state}</Badge>
                      </td>
                      <td className="p-2">
                        {item.tags && item.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.tags.map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="text-sm text-muted-foreground">
              {selectedIds.size} user story(s) selected
            </div>
          )}

          {message && (
            <Alert
              variant={messageType === "error" ? "destructive" : "default"}
              className={
                messageType === "success"
                  ? "bg-green-50 border-green-200"
                  : messageType === "info"
                  ? "bg-blue-50 border-blue-200"
                  : ""
              }
            >
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              onClick={onClose}
              disabled={importing}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleImport} disabled={importing}>
              {importing ? "Importing..." : "Import selected"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
