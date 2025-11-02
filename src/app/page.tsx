"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { KeyboardEvent } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
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
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddTaskModal } from "@/features/tasks";
import { SettingsModal, ImportModal } from "@/features/azure-devops";
import { DayOffsModal } from "@/features/day-offs";

const WEEK_STARTS_ON_MONDAY = { weekStartsOn: 1 as const };

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
  const monthParam = useMemo(
    () => format(currentDate, "yyyy-MM"),
    [currentDate]
  );

  const dayOffRange = useMemo(() => {
    if (viewMode === "week") {
      return {
        startDate: format(
          startOfWeek(currentDate, WEEK_STARTS_ON_MONDAY),
          "yyyy-MM-dd"
        ),
        endDate: format(
          endOfWeek(currentDate, WEEK_STARTS_ON_MONDAY),
          "yyyy-MM-dd"
        ),
      };
    }

    return {
      startDate: format(startOfMonth(currentDate), "yyyy-MM-dd"),
      endDate: format(endOfMonth(currentDate), "yyyy-MM-dd"),
    };
  }, [currentDate, viewMode]);

  const fetchTasks = useCallback(
    async (showLoader = false) => {
      try {
        if (showLoader) setLoading(true);
        const response = await fetch(`/api/tasks?month=${monthParam}`);
        if (!response.ok) throw new Error("Failed to fetch tasks");
        const data = await response.json();
        setTasks(data);
        setError("");
      } catch (err) {
        setError(
          "Failed to load tasks. Please check your database connection."
        );
        console.error(err);
      } finally {
        if (showLoader) setLoading(false);
        setInitialLoading(false);
      }
    },
    [monthParam]
  );

  const fetchDayOffs = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/day-offs?startDate=${dayOffRange.startDate}&endDate=${dayOffRange.endDate}`
      );
      if (!response.ok) throw new Error("Failed to fetch day-offs");
      const data = await response.json();
      setDayOffs(data);
    } catch (err) {
      console.error("Failed to load day-offs:", err);
    }
  }, [dayOffRange]);

  useEffect(() => {
    fetchTasks(true);
  }, [fetchTasks]);

  useEffect(() => {
    fetchDayOffs();
  }, [fetchDayOffs]);

  const dayOffMap = useMemo(
    () => new Map(dayOffs.map((dayOff) => [dayOff.date, dayOff] as const)),
    [dayOffs]
  );

  const calendarDays = useMemo(
    () => {
      const interval =
        viewMode === "week"
          ? {
              start: startOfWeek(currentDate, WEEK_STARTS_ON_MONDAY),
              end: endOfWeek(currentDate, WEEK_STARTS_ON_MONDAY),
            }
          : {
              start: startOfMonth(currentDate),
              end: endOfMonth(currentDate),
            };

      return eachDayOfInterval(interval).map((date) => {
        const key = format(date, "yyyy-MM-dd");
        const dayOff = dayOffMap.get(key);
        return {
          date,
          key,
          dayOff,
          isDayOff: Boolean(dayOff),
          isWeekend: isSaturday(date) || isSunday(date),
          isToday: isToday(date),
        };
      });
    },
    [currentDate, viewMode, dayOffMap]
  );

  const totalHoursByDay = useMemo(
    () =>
      calendarDays.map((day) =>
        tasks.reduce(
          (sum, task) => sum + (task.timeEntries[day.key] || 0),
          0
        )
      ),
    [calendarDays, tasks]
  );

  const totalHoursByTask = useMemo(
    () =>
      tasks.map((task) =>
        Object.values(task.timeEntries).reduce(
          (sum, hours) => sum + hours,
          0
        )
      ),
    [tasks]
  );

  const grandTotal = useMemo(
    () => totalHoursByTask.reduce((sum, hours) => sum + hours, 0),
    [totalHoursByTask]
  );

  const handleCellClick = useCallback(
    (taskId: number, date: string, currentHours: number) => {
      setEditingCell({ taskId, date });
      setEditValue(currentHours > 0 ? currentHours.toString() : "");
    },
    []
  );

  const handleCellSave = useCallback(async () => {
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
  }, [editValue, editingCell, fetchTasks]);

  const handleKeyPress = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        handleCellSave();
      } else if (e.key === "Escape") {
        setEditingCell(null);
        setEditValue("");
      }
    },
    [handleCellSave]
  );

  const changeDate = useCallback(
    (offset: number) => {
      if (viewMode === "week") {
        setCurrentDate((prev) => addWeeks(prev, offset));
      } else {
        setCurrentDate((prev) => addMonths(prev, offset));
      }
    },
    [viewMode]
  );

  const weekStart = useMemo(
    () => startOfWeek(currentDate, WEEK_STARTS_ON_MONDAY),
    [currentDate]
  );
  const weekEnd = useMemo(
    () => endOfWeek(currentDate, WEEK_STARTS_ON_MONDAY),
    [currentDate]
  );

  const formatTimeDisplay = useCallback((hours: number): string => {
    if (hours === 0) return "";
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}:${m.toString().padStart(2, "0")}`;
  }, []);

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

  const handleStatusChange = async (taskId: number, newStatus: string, hasExternalSource: boolean) => {
    try {
      // Use Azure DevOps sync endpoint if task is linked to Azure DevOps
      const endpoint = hasExternalSource 
        ? "/api/azure-devops/update-status"
        : "/api/tasks";
      
      const response = await fetch(endpoint, {
        method: hasExternalSource ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          taskId: taskId,
          id: taskId,
          status: newStatus 
        }),
      });

      if (!response.ok) throw new Error("Failed to update status");

      const result = await response.json();
      
      // Show feedback message
      if (result.synced) {
        setSuccessMessage("Status updated and synced with Azure DevOps");
      } else if (result.localOnly) {
        setSuccessMessage(result.message || "Status updated locally");
      } else {
        setSuccessMessage("Status updated successfully");
      }

      // Clear message after 3 seconds
      setTimeout(() => setSuccessMessage(""), 3000);

      await fetchTasks();
    } catch (err) {
      setError("Failed to update status");
      setTimeout(() => setError(""), 3000);
      console.error(err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError("");
    setSuccessMessage("");
    
    try {
      // First, refresh Azure DevOps tasks
      const refreshResponse = await fetch("/api/azure-devops/refresh", {
        method: "POST",
      });

      if (refreshResponse.ok) {
        const result = await refreshResponse.json();
        console.log("Azure DevOps refresh result:", result);
        
        if (result.updated > 0) {
          // Show success message
          setSuccessMessage(`Successfully updated ${result.updated} task(s) from Azure DevOps`);
          setTimeout(() => setSuccessMessage(""), 5000);
        } else if (result.skipped > 0) {
          setSuccessMessage(
            `All ${result.skipped} imported task(s) are up to date`
          );
          setTimeout(() => setSuccessMessage(""), 5000);
        }
      } else if (refreshResponse.status === 400) {
        // Settings not configured, silently skip
        console.log("Azure DevOps settings not configured, skipping refresh");
      } else {
        const errorData = await refreshResponse.json();
        setError(errorData.error || "Failed to refresh Azure DevOps tasks");
      }
    } catch (err) {
      console.error("Error refreshing Azure DevOps tasks:", err);
      setError("An error occurred while refreshing tasks");
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
            + Day Offs
          </Button>
          <Button onClick={() => setShowImport(true)} variant="outline">
            Import from Azure DevOps
          </Button>
          <Button 
            onClick={handleRefresh} 
            variant="outline"
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button onClick={() => setShowSettings(true)} variant="outline">
            Settings
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
                {calendarDays.map((day) => {
                  const headerClass = day.isToday
                    ? "bg-orange-100"
                    : day.isDayOff
                    ? "bg-purple-100"
                    : day.isWeekend
                    ? "bg-gray-200"
                    : "bg-gray-50";

                  const title = day.isDayOff
                    ? day.dayOff?.description || "Day off"
                    : "";

                  const textClass = day.isToday
                    ? "text-orange-600"
                    : day.isDayOff
                    ? "text-purple-700"
                    : day.isWeekend
                    ? "text-gray-600"
                    : "text-gray-900";

                  const subTextClass = day.isToday
                    ? "text-orange-600"
                    : day.isDayOff
                    ? "text-purple-600"
                    : "text-gray-500";

                  return (
                    <th
                      key={day.key}
                      className={`p-3 text-center font-normal text-sm ${headerClass}`}
                      style={{ minWidth: "100px", width: "100px" }}
                      title={title}
                    >
                      <div className={`font-medium ${textClass}`}>
                        {format(day.date, "EEE")}
                      </div>
                      <div className={`text-xs ${subTextClass}`}>
                        {format(day.date, "dd MMM")}
                        {day.isDayOff && (
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
                  className="group border-b border-gray-200 hover:bg-gray-100"
                >
                  <td
                    className="py-2 px-3 sticky left-0 bg-white group-hover:bg-gray-100 z-10"
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
                        <div className="flex items-center gap-2 mt-1">
                          <Select
                            value={task.status || ""}
                            onValueChange={(value) => 
                              handleStatusChange(
                                task.id, 
                                value, 
                                task.external_source === "azure_devops"
                              )
                            }
                          >
                            <SelectTrigger className="w-[140px] h-7 text-xs">
                              <SelectValue placeholder="Set status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="New">New</SelectItem>
                              <SelectItem value="Active">Active</SelectItem>
                              <SelectItem value="Resolved">Resolved</SelectItem>
                              <SelectItem value="Closed">Closed</SelectItem>
                            </SelectContent>
                          </Select>
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
                  {calendarDays.map((day) => {
                    const hours = task.timeEntries[day.key] || 0;
                    const isEditing =
                      editingCell?.taskId === task.id &&
                      editingCell?.date === day.key;

                    const cellClass = day.isToday
                      ? "bg-orange-50 group-hover:bg-orange-200"
                      : day.isDayOff
                      ? "bg-purple-50 group-hover:bg-purple-200"
                      : day.isWeekend
                      ? "bg-gray-100 group-hover:bg-gray-300"
                      : "bg-white group-hover:bg-gray-100";

                    return (
                      <td
                        key={day.key}
                        className={`py-2 px-3 text-center cursor-pointer transition-colors ${cellClass}`}
                        onClick={() =>
                          !isEditing && handleCellClick(task.id, day.key, hours)
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
                    className="py-2 px-3 text-center font-semibold text-sm text-gray-900 group-hover:bg-gray-100"
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
                {calendarDays.map((day, index) => {
                  const total = totalHoursByDay[index];
                  const cellClass = day.isToday
                    ? "bg-orange-100 text-orange-900"
                    : day.isDayOff
                    ? "bg-purple-100 text-purple-900"
                    : day.isWeekend
                    ? "bg-gray-200 text-gray-700"
                    : "bg-gray-50 text-gray-900";

                  return (
                    <td
                      key={day.key}
                      className={`p-3 text-center font-semibold text-sm ${cellClass}`}
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