"use client";

import { useState, useEffect } from "react";
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
import type { AzureDevOpsWorkItem } from "@/types";

interface ImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportModal({ onClose, onSuccess }: ImportModalProps) {
  const [workItems, setWorkItems] = useState<AzureDevOpsWorkItem[]>([]);
  const [filteredWorkItems, setFilteredWorkItems] = useState<AzureDevOpsWorkItem[]>([]);
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
      const filtered = workItems.filter(
        (item) =>
          item.id.toString().includes(searchText) ||
          item.title.toLowerCase().includes(searchText)
      );
      setFilteredWorkItems(filtered);
    }
  }, [filterText, workItems]);

  const fetchWorkItems = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/azure-devops/work-items");
      const data = await response.json();

      if (response.ok) {
        setWorkItems(data.workItems || []);
        setFilteredWorkItems(data.workItems || []);
      } else {
        setMessage(`✗ Failed to fetch work items: ${data.error || "Unknown error"}`);
        setMessageType("error");
      }
    } catch (err) {
      setMessage("✗ Failed to fetch work items: Network error");
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
      setMessage("Please select at least one work item to import");
      setMessageType("error");
      return;
    }

    setImporting(true);
    setMessage("Importing selected work items...");
    setMessageType("info");

    try {
      const response = await fetch("/api/azure-devops/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItemIds: Array.from(selectedIds) }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(
          `✓ Successfully imported ${data.imported} work item(s)${
            data.skipped > 0 ? `, skipped ${data.skipped} (already exists)` : ""
          }`
        );
        setMessageType("success");
        setTimeout(() => {
          onSuccess();
        }, 2000);
      } else {
        setMessage(`✗ Import failed: ${data.error || "Unknown error"}`);
        setMessageType("error");
      }
    } catch (err) {
      setMessage("✗ Import failed: Network error");
      setMessageType("error");
    } finally {
      setImporting(false);
    }
  };

  const allSelected = filteredWorkItems.length > 0 && selectedIds.size === filteredWorkItems.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredWorkItems.length;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Import from Azure DevOps</DialogTitle>
          <DialogDescription>
            Select work items to import from your Azure DevOps project
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
              placeholder="Filter by work item ID or title..."
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
                ? "No work items found assigned to you"
                : "No work items match your filter"}
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
                      <td className="p-2 font-mono text-sm">{item.id}</td>
                      <td className="p-2">{item.title}</td>
                      <td className="p-2">
                        <Badge variant="outline">{item.type}</Badge>
                      </td>
                      <td className="p-2">
                        <Badge variant="secondary">{item.state}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="text-sm text-muted-foreground">
              {selectedIds.size} work item(s) selected
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
            <Button
              type="button"
              onClick={handleImport}
              disabled={importing || selectedIds.size === 0 || loading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {importing ? "Importing..." : `Import ${selectedIds.size > 0 ? `(${selectedIds.size})` : ""}`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
