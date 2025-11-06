"use client";

import { useState, useEffect } from "react";
import type { Blocker, BlockerSeverity } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
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
import { Badge } from "@/components/ui/badge";

interface BlockersModalProps {
  taskId: number;
  taskTitle: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function BlockersModal({
  taskId,
  taskTitle,
  onClose,
  onSuccess,
}: BlockersModalProps) {
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState("");
  const [severity, setSeverity] = useState<BlockerSeverity>("medium");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editComment, setEditComment] = useState("");
  const [editSeverity, setEditSeverity] = useState<BlockerSeverity>("medium");

  useEffect(() => {
    fetchBlockers();
  }, [taskId]);

  const fetchBlockers = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/blockers?taskId=${taskId}`);
      if (!response.ok) throw new Error("Failed to fetch blockers");
      const data = await response.json();
      setBlockers(data);
      setError("");
    } catch (err) {
      setError("Failed to load blockers");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBlocker = async () => {
    if (!comment.trim()) {
      setError("Comment is required");
      return;
    }

    try {
      const response = await fetch("/api/blockers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          comment: comment.trim(),
          severity,
        }),
      });

      if (!response.ok) throw new Error("Failed to add blocker");

      setComment("");
      setSeverity("medium");
      await fetchBlockers();
      onSuccess?.();
    } catch (err) {
      setError("Failed to add blocker");
      console.error(err);
    }
  };

  const handleUpdateBlocker = async (blockerId: number) => {
    if (!editComment.trim()) {
      setError("Comment is required");
      return;
    }

    try {
      const response = await fetch("/api/blockers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: blockerId,
          comment: editComment.trim(),
          severity: editSeverity,
        }),
      });

      if (!response.ok) throw new Error("Failed to update blocker");

      setEditingId(null);
      setEditComment("");
      setEditSeverity("medium");
      await fetchBlockers();
      onSuccess?.();
    } catch (err) {
      setError("Failed to update blocker");
      console.error(err);
    }
  };

  const handleToggleResolved = async (blocker: Blocker) => {
    try {
      const response = await fetch("/api/blockers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: blocker.id,
          is_resolved: blocker.is_resolved ? 0 : 1,
        }),
      });

      if (!response.ok) throw new Error("Failed to toggle blocker status");

      await fetchBlockers();
      onSuccess?.();
    } catch (err) {
      setError("Failed to toggle blocker status");
      console.error(err);
    }
  };

  const handleDeleteBlocker = async (blockerId: number) => {
    if (!confirm("Are you sure you want to delete this blocker?")) {
      return;
    }

    try {
      const response = await fetch(`/api/blockers?id=${blockerId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete blocker");

      await fetchBlockers();
      onSuccess?.();
    } catch (err) {
      setError("Failed to delete blocker");
      console.error(err);
    }
  };

  const startEdit = (blocker: Blocker) => {
    setEditingId(blocker.id);
    setEditComment(blocker.comment);
    setEditSeverity(blocker.severity);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditComment("");
    setEditSeverity("medium");
  };

  const getSeverityColor = (severity: BlockerSeverity) => {
    switch (severity) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-800";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700";
    }
  };

  const getSeverityLabel = (severity: BlockerSeverity) => {
    return severity.charAt(0).toUpperCase() + severity.slice(1);
  };

  const activeBlockers = blockers.filter((b) => !b.is_resolved);
  const resolvedBlockers = blockers.filter((b) => b.is_resolved);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Blockers for: {taskTitle}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add New Blocker */}
          <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
            <h3 className="font-semibold mb-3">Add New Blocker</h3>
            <div className="space-y-3">
              <div>
                <Label htmlFor="comment">Comment</Label>
                <Input
                  id="comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Describe the blocker..."
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="severity">Severity</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as BlockerSeverity)}>
                  <SelectTrigger id="severity" className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddBlocker} className="w-full">
                Add Blocker
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm dark:bg-red-950 dark:border-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {/* Active Blockers */}
          {activeBlockers.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3 text-red-700 dark:text-red-400">
                Active Blockers ({activeBlockers.length})
              </h3>
              <div className="space-y-3">
                {activeBlockers.map((blocker) => (
                  <div
                    key={blocker.id}
                    className="border rounded-lg p-4 bg-white dark:bg-gray-950"
                  >
                    {editingId === blocker.id ? (
                      <div className="space-y-3">
                        <div>
                          <Label>Comment</Label>
                          <Input
                            value={editComment}
                            onChange={(e) => setEditComment(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Severity</Label>
                          <Select
                            value={editSeverity}
                            onValueChange={(v) => setEditSeverity(v as BlockerSeverity)}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="medium">Medium</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                              <SelectItem value="critical">Critical</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleUpdateBlocker(blocker.id)}
                            size="sm"
                          >
                            Save
                          </Button>
                          <Button onClick={cancelEdit} variant="outline" size="sm">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <Badge className={getSeverityColor(blocker.severity)}>
                            {getSeverityLabel(blocker.severity)}
                          </Badge>
                          <div className="flex gap-1">
                            <Button
                              onClick={() => startEdit(blocker)}
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                            >
                              Edit
                            </Button>
                            <Button
                              onClick={() => handleToggleResolved(blocker)}
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-green-600 hover:text-green-700"
                            >
                              Resolve
                            </Button>
                            <Button
                              onClick={() => handleDeleteBlocker(blocker.id)}
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-600 hover:text-red-700"
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{blocker.comment}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Created: {new Date(blocker.created_at).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resolved Blockers */}
          {resolvedBlockers.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3 text-green-700 dark:text-green-400">
                Resolved Blockers ({resolvedBlockers.length})
              </h3>
              <div className="space-y-3">
                {resolvedBlockers.map((blocker) => (
                  <div
                    key={blocker.id}
                    className="border rounded-lg p-4 bg-green-50 opacity-70 dark:bg-green-950"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge className={getSeverityColor(blocker.severity)}>
                        {getSeverityLabel(blocker.severity)}
                      </Badge>
                      <div className="flex gap-1">
                        <Button
                          onClick={() => handleToggleResolved(blocker)}
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-orange-600 hover:text-orange-700"
                        >
                          Unresolve
                        </Button>
                        <Button
                          onClick={() => handleDeleteBlocker(blocker.id)}
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-600 hover:text-red-700"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{blocker.comment}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Resolved: {blocker.resolved_at ? new Date(blocker.resolved_at).toLocaleString() : "N/A"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && <div className="text-center py-4">Loading blockers...</div>}

          {!loading && blockers.length === 0 && (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              No blockers for this task
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
