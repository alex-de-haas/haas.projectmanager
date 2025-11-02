"use client";

import { useState, useEffect } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isWeekend,
  isToday,
  addWeeks,
  addMonths,
  isSaturday,
  isSunday,
} from "date-fns";
import type { TaskWithTimeEntries, DayOff } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const [tasks, setTasks] = useState<TaskWithTimeEntries[]>([]);
  const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const [showAddTask, setShowAddTask] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDayOffs, setShowDayOffs] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    taskId: number;
    date: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");

  const days =
    viewMode === "week"
      ? eachDayOfInterval({
          start: startOfWeek(currentDate, { weekStartsOn: 1 }), // Monday
          end: endOfWeek(currentDate, { weekStartsOn: 1 }),
        })
      : eachDayOfInterval({
          start: startOfMonth(currentDate),
          end: endOfMonth(currentDate),
        });

  useEffect(() => {
    fetchTasks(true);
    fetchDayOffs();
  }, [currentDate, viewMode]);

  const fetchTasks = async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const monthParam = format(currentDate, "yyyy-MM");
      const response = await fetch(`/api/tasks?month=${monthParam}`);
      if (!response.ok) throw new Error("Failed to fetch tasks");
      const data = await response.json();
      setTasks(data);
      setError("");
    } catch (err) {
      setError("Failed to load tasks. Please check your database connection.");
      console.error(err);
    } finally {
      if (showLoader) setLoading(false);
      setInitialLoading(false);
    }
  };

  const fetchDayOffs = async () => {
    try {
      const startDate =
        viewMode === "week"
          ? format(startOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd")
          : format(startOfMonth(currentDate), "yyyy-MM-dd");
      const endDate =
        viewMode === "week"
          ? format(endOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd")
          : format(endOfMonth(currentDate), "yyyy-MM-dd");

      const response = await fetch(
        `/api/day-offs?startDate=${startDate}&endDate=${endDate}`
      );
      if (!response.ok) throw new Error("Failed to fetch day-offs");
      const data = await response.json();
      setDayOffs(data);
    } catch (err) {
      console.error("Failed to load day-offs:", err);
    }
  };

  const isDayOff = (date: Date): boolean => {
    const dateStr = format(date, "yyyy-MM-dd");
    return dayOffs.some((dayOff) => dayOff.date === dateStr);
  };

  const handleCellClick = (
    taskId: number,
    date: string,
    currentHours: number
  ) => {
    setEditingCell({ taskId, date });
    setEditValue(currentHours > 0 ? currentHours.toString() : "");
  };

  const handleCellSave = async () => {
    if (!editingCell) return;

    const hours = parseFloat(editValue) || 0;

    try {
      const response = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: editingCell.taskId,
          date: editingCell.date,
          hours,
        }),
      });

      if (!response.ok) throw new Error("Failed to save time entry");

      await fetchTasks();
      setEditingCell(null);
      setEditValue("");
    } catch (err) {
      alert("Failed to save time entry");
      console.error(err);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleCellSave();
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setEditValue("");
    }
  };

  const changeDate = (offset: number) => {
    if (viewMode === "week") {
      setCurrentDate(addWeeks(currentDate, offset));
    } else {
      setCurrentDate(addMonths(currentDate, offset));
    }
  };

  const totalHoursByDay = days.map((day) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return tasks.reduce(
      (sum, task) => sum + (task.timeEntries[dateStr] || 0),
      0
    );
  });

  const totalHoursByTask = tasks.map((task) =>
    Object.values(task.timeEntries).reduce((sum, hours) => sum + hours, 0)
  );

  const grandTotal = totalHoursByTask.reduce((sum, hours) => sum + hours, 0);

  const handleTaskClick = async (task: TaskWithTimeEntries) => {
    if (task.external_source === "azure_devops" && task.external_id) {
      try {
        const response = await fetch(`/api/settings?key=azure_devops`);
        if (response.ok) {
          const setting = await response.json();

          if (setting && setting.value) {
            const azureSettings =
              typeof setting.value === "string"
                ? JSON.parse(setting.value)
                : setting.value;

            if (azureSettings.organization && azureSettings.project) {
              const url = `https://dev.azure.com/${azureSettings.organization}/${azureSettings.project}/_workitems/edit/${task.external_id}`;
              window.open(url, "_blank");
            } else {
              console.error(
                "Azure DevOps organization or project not configured"
              );
            }
          }
        }
      } catch (err) {
        console.error("Failed to open Azure DevOps link", err);
      }
    }
  };

  const handleDeleteTask = async (taskId: number, taskTitle: string) => {
    if (
      !confirm(
        `Are you sure you want to delete the task "${taskTitle}"? This will also delete all associated time entries.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/tasks?id=${taskId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete task");

      await fetchTasks();
    } catch (err) {
      alert("Failed to delete task");
      console.error(err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError("");
    setSuccessMessage("");
    
    try {
      // First, refresh Azure DevOps tasks
      const refreshResponse = await fetch('/api/azure-devops/refresh', {
        method: 'POST',
      });

      if (refreshResponse.ok) {
        const result = await refreshResponse.json();
        console.log('Azure DevOps refresh result:', result);
        
        if (result.updated > 0) {
          // Show success message
          setSuccessMessage(`Successfully updated ${result.updated} task(s) from Azure DevOps`);
          setTimeout(() => setSuccessMessage(""), 5000);
        } else if (result.skipped > 0) {
          setSuccessMessage(`All ${result.skipped} imported task(s) are up to date`);
          setTimeout(() => setSuccessMessage(""), 5000);
        }
      } else if (refreshResponse.status === 400) {
        // Settings not configured, silently skip
        console.log('Azure DevOps settings not configured, skipping refresh');
      } else {
        const errorData = await refreshResponse.json();
        setError(errorData.error || 'Failed to refresh Azure DevOps tasks');
      }
    } catch (err) {
      console.error('Error refreshing Azure DevOps tasks:', err);
      setError('An error occurred while refreshing tasks');
    } finally {
      // Always fetch latest tasks from database
      await fetchTasks();
      setIsRefreshing(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="py-6 mx-auto">
        <Card>
          <CardHeader>
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });

  const formatTimeDisplay = (hours: number): string => {
    if (hours === 0) return "";
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}:${m.toString().padStart(2, "0")}` : `${h}:00`;
  };

  return (
    <div className="py-6 mx-auto">
      <div className="p-6">
        <div className="flex gap-3 items-center justify-between flex-wrap mb-4">
          <div className="flex gap-3 items-center">
            <Button
              onClick={() => changeDate(-1)}
              variant="outline"
              size="icon"
              className="h-10 w-10"
            >
              ←
            </Button>
            <h1 className="text-2xl font-semibold">
              {viewMode === "week"
                ? `This week: ${format(weekStart, "dd")} – ${format(
                    weekEnd,
                    "dd MMM yyyy"
                  )}`
                : format(currentDate, "MMMM yyyy")}
            </h1>
            <Button
              onClick={() => changeDate(1)}
              variant="outline"
              size="icon"
              className="h-10 w-10"
            >
              →
            </Button>
          </div>
          <div className="flex bg-gray-100 rounded-md p-1">
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              className={`h-8 px-4 ${
                viewMode === "week"
                  ? "bg-orange-500 text-white hover:bg-orange-600"
                  : ""
              }`}
              onClick={() => setViewMode("week")}
            >
              Week
            </Button>
            <Button
              variant={viewMode === "month" ? "default" : "ghost"}
              size="sm"
              className="h-8 px-4"
              onClick={() => setViewMode("month")}
            >
              Month
            </Button>
          </div>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <Button onClick={() => setShowAddTask(true)} variant="outline">
            + Add row
          </Button>
          <Button onClick={() => setShowDayOffs(true)} variant="outline">
            🏖️ Day Offs
          </Button>
          <Button onClick={() => setShowImport(true)} variant="outline">
            Import from Azure DevOps
          </Button>
          <Button 
            onClick={handleRefresh} 
            variant="outline"
            disabled={isRefreshing}
          >
            {isRefreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
          </Button>
          <Button onClick={() => setShowSettings(true)} variant="outline">
            ⚙️ Settings
          </Button>
          <Button variant="default" className="bg-green-600 hover:bg-green-700">
            Save
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="mb-6 border-green-200 bg-green-50 text-green-800">
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden h-[calc(100vh-280px)]">
        <div className="overflow-auto h-full">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-20">
                <th className="p-3 text-left font-normal text-gray-600 text-sm sticky left-0 bg-gray-50 z-10 overflow-hidden w-[200px]">
                  {/* Empty for task names */}
                </th>
                {days.map((day) => {
                  const isWeekendDay = isSaturday(day) || isSunday(day);
                  const isDayOffDay = isDayOff(day);
                  const dayOffInfo = dayOffs.find(
                    (d) => d.date === format(day, "yyyy-MM-dd")
                  );

                  return (
                    <th
                      key={day.toString()}
                      className={`p-3 text-center font-normal text-sm ${
                        isToday(day)
                          ? "bg-orange-100"
                          : isDayOffDay
                          ? "bg-purple-100"
                          : isWeekendDay
                          ? "bg-gray-200"
                          : "bg-gray-50"
                      }`}
                      style={{ minWidth: "100px", width: "100px" }}
                      title={
                        isDayOffDay ? dayOffInfo?.description || "Day off" : ""
                      }
                    >
                      <div
                        className={`font-medium ${
                          isToday(day)
                            ? "text-orange-600"
                            : isDayOffDay
                            ? "text-purple-700"
                            : isWeekendDay
                            ? "text-gray-600"
                            : "text-gray-900"
                        }`}
                      >
                        {format(day, "EEE")}
                      </div>
                      <div
                        className={`text-xs ${
                          isToday(day)
                            ? "text-orange-600"
                            : isDayOffDay
                            ? "text-purple-600"
                            : isWeekendDay
                            ? "text-gray-500"
                            : "text-gray-500"
                        }`}
                      >
                        {format(day, "dd MMM")}
                        {isDayOffDay && (
                          <div className="text-[10px] font-medium">
                            🏖️ Day Off
                          </div>
                        )}
                      </div>
                    </th>
                  );
                })}
                <th
                  className="p-3 text-center font-normal text-gray-600 text-sm bg-gray-50"
                  style={{ minWidth: "100px", width: "100px" }}
                >
                  {/* Empty for totals */}
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, taskIndex) => (
                <tr
                  key={task.id}
                  className="group border-b border-gray-200 hover:bg-gray-50"
                >
                  <td
                    className="py-2 px-3 sticky left-0 bg-white group-hover:bg-gray-50 z-10"
                    style={{ minWidth: "400px", width: "400px" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 flex items-center gap-1.5 min-w-0">
                          <div
                            className="flex items-center justify-center flex-shrink-0"
                            title={task.type === "bug" ? "Bug" : "Task"}
                          >
                            {task.type === "bug" ? (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M4.47 2.53a.75.75 0 0 1 1.06 0l.97.97a3.5 3.5 0 0 1 3 0l.97-.97a.75.75 0 1 1 1.06 1.06l-.47.47c.52.56.89 1.28 1.01 2.08H13a.75.75 0 0 1 0 1.5h-.94a3.51 3.51 0 0 1-1.01 2.08l.47.47a.75.75 0 1 1-1.06 1.06l-.97-.97a3.5 3.5 0 0 1-3 0l-.97.97a.75.75 0 0 1-1.06-1.06l.47-.47A3.51 3.51 0 0 1 3.92 7.64H3a.75.75 0 0 1 0-1.5h.92c.12-.8.49-1.52 1.01-2.08l-.46-.47a.75.75 0 0 1 0-1.06ZM6.5 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm3 1.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0Z"
                                  fill="#dc2626"
                                />
                              </svg>
                            ) : (
                              <svg
                                width="16"
                                height="16"
                                viewBox="0 0 16 16"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                              >
                                <path
                                  d="M2.5 3.5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-1ZM3 3h10v1H3V3Z"
                                  fill="#3b82f6"
                                />
                                <path
                                  d="M2.5 7.5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-1ZM3 7h10v1H3V7ZM2.5 11.5a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5v-1ZM3 11h10v1H3v-1Z"
                                  fill="#3b82f6"
                                />
                              </svg>
                            )}
                          </div>
                          {task.external_source === "azure_devops" &&
                            task.external_id && (
                              <Badge
                                variant="outline"
                                className="border-blue-200 bg-blue-50 text-blue-700 text-xs h-5 flex-shrink-0"
                                title={`Azure DevOps Work Item ${parseInt(
                                  task.external_id
                                )}`}
                              >
                                {parseInt(task.external_id)}
                              </Badge>
                            )}
                          {task.status && (
                            <Badge
                              variant="outline"
                              className="border-gray-200 bg-gray-50 text-gray-700 text-xs h-5 flex-shrink-0"
                              title={`Status: ${task.status}`}
                            >
                              {task.status}
                            </Badge>
                          )}
                          <div className="truncate min-w-0" title={task.title}>
                            {task.external_source === "azure_devops" &&
                            task.external_id ? (
                              <button
                                onClick={() => handleTaskClick(task)}
                                className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer text-left truncate block w-full"
                                title={`${task.title} - Open in Azure DevOps`}
                              >
                                {task.title}
                              </button>
                            ) : (
                              task.title
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
                        onClick={() => handleDeleteTask(task.id, task.title)}
                        title="Delete task"
                      >
                        ✕
                      </Button>
                    </div>
                  </td>
                  {days.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const hours = task.timeEntries[dateStr] || 0;
                    const isEditing =
                      editingCell?.taskId === task.id &&
                      editingCell?.date === dateStr;
                    const isWeekendDay = isSaturday(day) || isSunday(day);
                    const isDayOffDay = isDayOff(day);

                    return (
                      <td
                        key={dateStr}
                        className={`py-2 px-3 text-center cursor-pointer transition-colors ${
                          isToday(day)
                            ? "bg-orange-50 group-hover:bg-orange-100"
                            : isDayOffDay
                            ? "bg-purple-50 group-hover:bg-purple-100"
                            : isWeekendDay
                            ? "bg-gray-100 group-hover:bg-gray-200"
                            : "bg-white group-hover:bg-gray-50"
                        }`}
                        onClick={() =>
                          !isEditing && handleCellClick(task.id, dateStr, hours)
                        }
                        style={{ minWidth: "100px", width: "100px" }}
                      >
                        {isEditing ? (
                          <Input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleCellSave}
                            onKeyDown={handleKeyPress}
                            autoFocus
                            className="w-20 text-center h-9 border-2 border-blue-500"
                          />
                        ) : hours > 0 ? (
                          <span className="text-sm font-medium text-gray-900">
                            {formatTimeDisplay(hours)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td
                    className="py-2 px-3 text-center font-semibold text-sm text-gray-900 group-hover:bg-gray-50"
                    style={{ minWidth: "100px", width: "100px" }}
                  >
                    {formatTimeDisplay(totalHoursByTask[taskIndex])}
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 border-t-2 border-gray-300 sticky bottom-0 z-10">
                <td className="p-3 sticky left-0 bg-gray-50 z-10 overflow-hidden w-[200px]">
                  {/* Empty cell */}
                </td>
                {totalHoursByDay.map((total, index) => {
                  const day = days[index];
                  const isWeekendDay =
                    day && (isSaturday(day) || isSunday(day));
                  const isDayOffDay = day && isDayOff(day);

                  return (
                    <td
                      key={index}
                      className={`p-3 text-center font-semibold text-sm ${
                        day && isToday(day)
                          ? "bg-orange-100 text-orange-900"
                          : isDayOffDay
                          ? "bg-purple-100 text-purple-900"
                          : isWeekendDay
                          ? "bg-gray-200 text-gray-700"
                          : "bg-gray-50 text-gray-900"
                      }`}
                      style={{ minWidth: "100px", width: "100px" }}
                    >
                      {total > 0 ? formatTimeDisplay(total) : "0"}
                    </td>
                  );
                })}
                <td
                  className="p-3 text-center font-bold text-sm text-gray-900"
                  style={{ minWidth: "100px", width: "100px" }}
                >
                  {formatTimeDisplay(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {showAddTask && (
        <AddTaskModal
          onClose={() => setShowAddTask(false)}
          onSuccess={() => {
            setShowAddTask(false);
            fetchTasks();
          }}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            setShowImport(false);
            fetchTasks();
          }}
        />
      )}

      {showDayOffs && (
        <DayOffsModal
          onClose={() => setShowDayOffs(false)}
          onSuccess={() => {
            setShowDayOffs(false);
            fetchDayOffs();
          }}
          currentDayOffs={dayOffs}
        />
      )}
    </div>
  );
}

interface AzureDevOpsSettings {
  organization: string;
  project: string;
  pat: string;
}

function AddTaskModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"task" | "bug">("task");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type }),
      });

      if (!response.ok) throw new Error("Failed to create task");

      onSuccess();
    } catch (err) {
      alert("Failed to create task");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Task</DialogTitle>
          <DialogDescription>
            Create a new task or bug to track time against.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter task title"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as "task" | "bug")}
            >
              <SelectTrigger id="type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="task">Task</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={onClose}
              disabled={submitting}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [organization, setOrganization] = useState("");
  const [project, setProject] = useState("");
  const [pat, setPat] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/settings?key=azure_devops");
      if (response.ok) {
        const data = await response.json();
        if (data.value) {
          const settings =
            typeof data.value === "string"
              ? JSON.parse(data.value)
              : data.value;
          setOrganization(settings.organization || "");
          setProject(settings.project || "");
          setPat(settings.pat || "");
        }
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!organization || !project || !pat) {
      setMessage("Please fill in all fields before testing");
      setMessageType("error");
      return;
    }

    setTesting(true);
    setMessage("");
    try {
      const response = await fetch("/api/azure-devops/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization, project, pat }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(
          `✓ Connection successful! Found project: ${data.project.name}`
        );
        setMessageType("success");
      } else {
        setMessage(`✗ Connection failed: ${data.error || "Unknown error"}`);
        setMessageType("error");
      }
    } catch (err) {
      setMessage("✗ Connection failed: Network error");
      setMessageType("error");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "azure_devops",
          value: { organization, project, pat },
        }),
      });

      if (!response.ok) throw new Error("Failed to save settings");

      setMessage("✓ Settings saved successfully!");
      setMessageType("success");
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setMessage("✗ Failed to save settings");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Azure DevOps Settings</DialogTitle>
          <DialogDescription>
            Configure your Azure DevOps connection to import work items
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="text-center py-8">Loading settings...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organization">Organization</Label>
              <Input
                id="organization"
                type="text"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                placeholder="e.g., mycompany"
                required
              />
              <p className="text-xs text-muted-foreground">
                From: https://dev.azure.com/[organization]
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project">Project</Label>
              <Input
                id="project"
                type="text"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                placeholder="e.g., MyProject"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pat">Personal Access Token (PAT)</Label>
              <Input
                id="pat"
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                placeholder="Enter your Azure DevOps PAT"
                required
              />
              <p className="text-xs text-muted-foreground">
                Create a PAT at: User Settings → Personal access tokens → New
                Token (needs Work Items: Read scope)
              </p>
            </div>

            {message && (
              <Alert
                variant={messageType === "success" ? "default" : "destructive"}
                className={
                  messageType === "success"
                    ? "bg-green-50 border-green-200"
                    : ""
                }
              >
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 justify-between pt-4">
              <Button
                type="button"
                onClick={handleTest}
                disabled={testing || saving}
                variant="outline"
                className="border-blue-600 text-blue-600 hover:bg-blue-50"
              >
                {testing ? "Testing..." : "Test Connection"}
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DayOffsModal({
  onClose,
  onSuccess,
  currentDayOffs,
}: {
  onClose: () => void;
  onSuccess: () => void;
  currentDayOffs: DayOff[];
}) {
  const [isRangeMode, setIsRangeMode] = useState(false);
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) return;
    if (isRangeMode && !endDate) return;
    if (isRangeMode && endDate < date) {
      setMessage("✗ End date must be after start date");
      setMessageType("error");
      return;
    }

    setSubmitting(true);
    setMessage("");
    
    try {
      if (isRangeMode) {
        // Create day-offs for date range
        const start = new Date(date);
        const end = new Date(endDate);
        const dates: string[] = [];
        
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dates.push(format(d, "yyyy-MM-dd"));
        }

        let addedCount = 0;
        let skippedCount = 0;

        for (const dateStr of dates) {
          try {
            const response = await fetch("/api/day-offs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ date: dateStr, description: description || null }),
            });

            if (response.ok) {
              addedCount++;
            } else if (response.status === 409) {
              skippedCount++;
            } else {
              const data = await response.json();
              throw new Error(data.error || "Failed to create day-off");
            }
          } catch (err: any) {
            if (!err.message.includes("already exists")) {
              throw err;
            }
            skippedCount++;
          }
        }

        setMessage(
          `✓ Added ${addedCount} day-off(s)${
            skippedCount > 0 ? `, skipped ${skippedCount} (already exists)` : ""
          }`
        );
        setMessageType("success");
      } else {
        // Single date
        const response = await fetch("/api/day-offs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, description: description || null }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to create day-off");
        }

        setMessage("✓ Day-off added successfully!");
        setMessageType("success");
      }

      setDate("");
      setEndDate("");
      setDescription("");
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err: any) {
      setMessage(`✗ ${err.message}`);
      setMessageType("error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this day-off?")) return;

    try {
      const response = await fetch(`/api/day-offs?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete day-off");

      setMessage("✓ Day-off deleted successfully!");
      setMessageType("success");
      setTimeout(() => {
        onSuccess();
      }, 1000);
    } catch (err) {
      setMessage("✗ Failed to delete day-off");
      setMessageType("error");
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Manage Day-Offs</DialogTitle>
          <DialogDescription>
            Add holidays, vacations, or other non-working days
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Mode</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={!isRangeMode ? "default" : "outline"}
                onClick={() => setIsRangeMode(false)}
                className="flex-1"
              >
                Single Day
              </Button>
              <Button
                type="button"
                variant={isRangeMode ? "default" : "outline"}
                onClick={() => setIsRangeMode(true)}
                className="flex-1"
              >
                Date Range
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">
                {isRangeMode ? "Start Date" : "Date"}
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            {isRangeMode && (
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                  min={date}
                />
              </div>
            )}
            {!isRangeMode && (
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input
                  id="description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Christmas, Vacation"
                />
              </div>
            )}
          </div>

          {isRangeMode && (
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Christmas, Vacation"
              />
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting
              ? "Adding..."
              : isRangeMode
              ? "+ Add Day-Off Range"
              : "+ Add Day-Off"}
          </Button>

          {message && (
            <Alert
              variant={messageType === "success" ? "default" : "destructive"}
              className={
                messageType === "success" ? "bg-green-50 border-green-200" : ""
              }
            >
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
        </form>

        {currentDayOffs.length > 0 && (
          <div className="space-y-2 mt-4">
            <h3 className="font-semibold text-sm text-gray-700">
              Current Day-Offs
            </h3>
            <div className="max-h-[300px] overflow-y-auto space-y-2">
              {currentDayOffs.map((dayOff) => (
                <div
                  key={dayOff.id}
                  className="flex items-center justify-between p-3 bg-purple-50 rounded-md border border-purple-200"
                >
                  <div>
                    <div className="font-medium text-sm text-gray-900">
                      {format(new Date(dayOff.date), "EEE, MMM dd, yyyy")}
                    </div>
                    {dayOff.description && (
                      <div className="text-xs text-gray-600">
                        {dayOff.description}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:text-red-800 hover:bg-red-50"
                    onClick={() => handleDelete(dayOff.id)}
                    title="Delete day-off"
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" onClick={onClose} variant="secondary">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [importMode, setImportMode] = useState<"assignedToMe" | "specific">(
    "assignedToMe"
  );
  const [workItemIds, setWorkItemIds] = useState("");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">(
    "info"
  );

  const handleImport = async () => {
    setImporting(true);
    setMessage("Importing work items...");
    setMessageType("info");

    try {
      const body: { assignedToMe?: boolean; workItemIds?: number[] } = {};

      if (importMode === "assignedToMe") {
        body.assignedToMe = true;
      } else {
        const ids = workItemIds
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
        if (ids.length === 0) {
          setMessage("Please enter valid work item IDs");
          setMessageType("error");
          setImporting(false);
          return;
        }
        body.workItemIds = ids;
      }

      const response = await fetch("/api/azure-devops/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import from Azure DevOps</DialogTitle>
          <DialogDescription>
            Import tasks and bugs from your Azure DevOps project
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Import Mode</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="assignedToMe"
                  checked={importMode === "assignedToMe"}
                  onChange={() => setImportMode("assignedToMe")}
                  className="h-4 w-4"
                />
                <span className="text-sm">
                  Import all work items assigned to me (not closed/removed)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="importMode"
                  value="specific"
                  checked={importMode === "specific"}
                  onChange={() => setImportMode("specific")}
                  className="h-4 w-4"
                />
                <span className="text-sm">Import specific work item IDs</span>
              </label>
            </div>
          </div>

          {importMode === "specific" && (
            <div className="space-y-2">
              <Label htmlFor="workItemIds">Work Item IDs</Label>
              <Input
                id="workItemIds"
                type="text"
                value={workItemIds}
                onChange={(e) => setWorkItemIds(e.target.value)}
                placeholder="e.g., 123, 456, 789"
              />
              <p className="text-xs text-muted-foreground">
                Enter work item IDs separated by commas
              </p>
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
              disabled={importing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {importing ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
