"use client";

import { useEffect, useMemo, useState } from "react";
import type { Release } from "@/types";
import { CheckCircle2, GripVertical, Plus, Trash2, UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface GeneralSettingsFormProps {
  onCancel?: () => void;
  onSaved?: () => void;
  showCancel?: boolean;
}

interface DatabaseBackupFile {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

interface AppUser {
  id: number;
  name: string;
  email?: string | null;
}

interface ApiError {
  error?: string;
}

interface SortableReleaseRowProps {
  id: number;
  release: Release;
  onRename: (release: Release) => void;
  onMarkCompleted: (release: Release) => void;
  updatingReleaseId: number | null;
}

function SortableReleaseRow({
  id,
  release,
  onRename,
  onMarkCompleted,
  updatingReleaseId,
}: SortableReleaseRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border p-2 bg-background"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground"
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{release.name}</div>
      </div>
      <Badge variant={release.status === "completed" ? "secondary" : "outline"}>
        {release.status === "completed" ? "Completed" : "Active"}
      </Badge>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onRename(release)}
        disabled={updatingReleaseId === release.id}
      >
        Rename
      </Button>
      {release.status !== "completed" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onMarkCompleted(release)}
          disabled={updatingReleaseId === release.id}
        >
          <CheckCircle2 className="h-4 w-4 mr-1" />
          Mark completed
        </Button>
      )}
    </div>
  );
}

export function GeneralSettingsForm({
  onCancel,
  onSaved,
  showCancel = false,
}: GeneralSettingsFormProps) {
  // General settings
  const [defaultDayLength, setDefaultDayLength] = useState("8");
  const [activeTab, setActiveTab] = useState("general");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [activeUserId, setActiveUserId] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [creatingUser, setCreatingUser] = useState(false);
  const [updatingUser, setUpdatingUser] = useState(false);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(true);
  const [releaseName, setReleaseName] = useState("");
  const [creatingRelease, setCreatingRelease] = useState(false);
  const [updatingReleaseId, setUpdatingReleaseId] = useState<number | null>(null);

  // Azure DevOps settings
  const [organization, setOrganization] = useState("");
  const [project, setProject] = useState("");
  const [pat, setPat] = useState("");

  // LM Studio settings
  const [lmStudioEndpoint, setLmStudioEndpoint] = useState(
    "http://localhost:1234"
  );
  const [lmStudioModel, setLmStudioModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [backups, setBackups] = useState<DatabaseBackupFile[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [deletingBackup, setDeletingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingLmStudio, setTestingLmStudio] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [showRenameUser, setShowRenameUser] = useState(false);
  const [renameUserName, setRenameUserName] = useState("");

  const releaseSensors = useSensors(
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

  const fetchModels = async (endpoint: string) => {
    setLoadingModels(true);
    try {
      const response = await fetch("/api/lm-studio/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      const data = await response.json();
      if (response.ok && data.models) {
        setAvailableModels(data.models);
      }
    } catch {
      // Silently fail - models will be empty
    } finally {
      setLoadingModels(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const [usersResponse, sessionResponse] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/auth/session"),
      ]);
      if (!usersResponse.ok) {
        throw new Error("Failed to fetch users");
      }

      const data = (await usersResponse.json()) as AppUser[];
      setUsers(data);
      if (sessionResponse.ok) {
        const sessionData = (await sessionResponse.json()) as { user?: AppUser };
        setActiveUserId(sessionData.user?.id ? String(sessionData.user.id) : "");
      } else {
        setActiveUserId("");
      }
    } catch (err) {
      setMessage("Failed to load users.");
      setMessageType("error");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadReleases = async () => {
    setLoadingReleases(true);
    try {
      const response = await fetch("/api/releases");
      if (!response.ok) {
        throw new Error("Failed to fetch releases");
      }
      const data = (await response.json()) as Release[];
      setReleases(data);
    } catch (err) {
      setMessage("Failed to load releases.");
      setMessageType("error");
    } finally {
      setLoadingReleases(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadSettings();
    loadBackups();
    loadReleases();
  }, []);

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      const response = await fetch("/api/database/backups");
      if (!response.ok) {
        throw new Error("Failed to load backups");
      }

      const data = (await response.json()) as DatabaseBackupFile[];
      setBackups(data);
      setSelectedBackup((currentSelected) => {
        if (currentSelected && data.some((backup) => backup.fileName === currentSelected)) {
          return currentSelected;
        }
        return data[0]?.fileName ?? "";
      });
    } catch (err) {
      setMessage("Failed to load database backups.");
      setMessageType("error");
    } finally {
      setLoadingBackups(false);
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      // Load general settings
      const generalResponse = await fetch(
        "/api/settings?key=default_day_length"
      );
      if (generalResponse.ok) {
        const data = await generalResponse.json();
        if (data.value) {
          setDefaultDayLength(data.value);
        }
      }

      // Load Azure DevOps settings
      const azureResponse = await fetch("/api/settings?key=azure_devops");
      if (azureResponse.ok) {
        const data = await azureResponse.json();
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

      // Load LM Studio settings
      const lmStudioResponse = await fetch("/api/settings?key=lm_studio");
      if (lmStudioResponse.ok) {
        const data = await lmStudioResponse.json();
        if (data.value) {
          const settings =
            typeof data.value === "string"
              ? JSON.parse(data.value)
              : data.value;
          setLmStudioEndpoint(settings.endpoint || "http://localhost:1234");
          setLmStudioModel(settings.model || "__default__");
          // Try to fetch models if endpoint is set
          if (settings.endpoint) {
            fetchModels(settings.endpoint);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchUser = async (userId: string) => {
    if (!userId || userId === activeUserId) return;
    setMessage("Switching user profiles is disabled. Please sign in as another user.");
    setMessageType("error");
  };

  const resetCreateUserDialog = () => {
    setNewUserEmail("");
    setNewUserName("");
  };

  const handleOpenCreateUser = () => {
    resetCreateUserDialog();
    setShowCreateUser(true);
  };

  const handleCreateUser = async () => {
    const trimmedEmail = newUserEmail.trim();
    const trimmed = newUserName.trim();
    if (!trimmedEmail) {
      setMessage("Email is required.");
      setMessageType("error");
      return;
    }

    setCreatingUser(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, email: trimmedEmail }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiError;
        setMessage(data.error || "Failed to create user.");
        setMessageType("error");
        return;
      }

      const created = (await response.json()) as AppUser;
      setUsers((prev) => [...prev, created]);
      setShowCreateUser(false);
      resetCreateUserDialog();
      setMessage(`Created user "${created.name}". Credentials were sent to ${created.email ?? trimmedEmail}.`);
      setMessageType("success");
    } catch (err) {
      setMessage("Failed to create user.");
      setMessageType("error");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleRenameUser = async () => {
    const selected = users.find((user) => String(user.id) === activeUserId);
    if (!selected) return;

    const trimmed = renameUserName.trim();
    if (!trimmed || trimmed === selected.name) return;

    setUpdatingUser(true);
    try {
      const response = await fetch(`/api/users?id=${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiError;
        setMessage(data.error || "Failed to rename user.");
        setMessageType("error");
        return;
      }

      const updated = (await response.json()) as AppUser;
      setUsers((prev) => prev.map((user) => (user.id === updated.id ? updated : user)));
      setShowRenameUser(false);
      setRenameUserName("");
      setMessage(`Renamed user to "${updated.name}".`);
      setMessageType("success");
    } catch (err) {
      setMessage("Failed to rename user.");
      setMessageType("error");
    } finally {
      setUpdatingUser(false);
    }
  };

  const handleOpenRenameUser = () => {
    const selected = users.find((user) => String(user.id) === activeUserId);
    if (!selected) return;
    setRenameUserName(selected.name);
    setShowRenameUser(true);
  };

  const handleDeleteUser = async () => {
    const selected = users.find((user) => String(user.id) === activeUserId);
    if (!selected || users.length <= 1) return;

    const confirmed = window.confirm(
      `Delete user "${selected.name}" and all associated data?`
    );
    if (!confirmed) return;

    setUpdatingUser(true);
    try {
      const response = await fetch(`/api/users?id=${selected.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiError;
        setMessage(data.error || "Failed to delete user.");
        setMessageType("error");
        return;
      }

      const nextUsers = users.filter((user) => user.id !== selected.id);
      setUsers(nextUsers);
      await loadUsers();
      setMessage(`Removed user "${selected.name}".`);
      setMessageType("success");
    } catch (err) {
      setMessage("Failed to delete user.");
      setMessageType("error");
    } finally {
      setUpdatingUser(false);
    }
  };

  const handleCreateRelease = async () => {
    const trimmed = releaseName.trim();
    if (!trimmed) {
      setMessage("Release name is required.");
      setMessageType("error");
      return;
    }

    setCreatingRelease(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const response = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          start_date: today,
          end_date: today,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(data.error || "Failed to create release.");
      }

      setReleaseName("");
      await loadReleases();
      setMessage(`Release "${trimmed}" created.`);
      setMessageType("success");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create release.";
      setMessage(errorMessage);
      setMessageType("error");
    } finally {
      setCreatingRelease(false);
    }
  };

  const handleRenameRelease = async (release: Release) => {
    const nextName = window.prompt("Rename release", release.name);
    if (!nextName) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === release.name) return;

    setUpdatingReleaseId(release.id);
    try {
      const response = await fetch("/api/releases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: release.id, name: trimmed }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(data.error || "Failed to rename release.");
      }

      setReleases((prev) =>
        prev.map((item) => (item.id === release.id ? { ...item, name: trimmed } : item))
      );
      setMessage(`Release renamed to "${trimmed}".`);
      setMessageType("success");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to rename release.";
      setMessage(errorMessage);
      setMessageType("error");
    } finally {
      setUpdatingReleaseId(null);
    }
  };

  const handleMarkReleaseCompleted = async (release: Release) => {
    if (release.status === "completed") return;

    setUpdatingReleaseId(release.id);
    try {
      const response = await fetch("/api/releases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: release.id, status: "completed" }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(data.error || "Failed to mark release as completed.");
      }

      setReleases((prev) =>
        prev.map((item) =>
          item.id === release.id ? { ...item, status: "completed" } : item
        )
      );
      setMessage(`Release "${release.name}" marked as completed.`);
      setMessageType("success");
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to mark release as completed.";
      setMessage(errorMessage);
      setMessageType("error");
    } finally {
      setUpdatingReleaseId(null);
    }
  };

  const handleReleaseDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const current = [...sortedReleases];
    const oldIndex = current.findIndex((release) => release.id === active.id);
    const newIndex = current.findIndex((release) => release.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(current, oldIndex, newIndex).map(
      (release, index) => ({
        ...release,
        display_order: index,
      })
    );
    setReleases(reordered);

    try {
      const response = await fetch("/api/releases/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releaseOrders: reordered.map((release, index) => ({
            id: release.id,
            order: index,
          })),
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(data.error || "Failed to reorder releases.");
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to reorder releases.";
      setMessage(errorMessage);
      setMessageType("error");
      await loadReleases();
    }
  };

  const handleTestAzureConnection = async () => {
    if (!organization || !project || !pat) {
      setMessage("Please fill in all Azure DevOps fields before testing");
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
          `Success: Connection successful. Found project: ${data.project.name}`
        );
        setMessageType("success");
      } else {
        setMessage(`Error: Connection failed: ${data.error || "Unknown error"}`);
        setMessageType("error");
      }
    } catch (err) {
      setMessage("Error: Connection failed: Network error");
      setMessageType("error");
    } finally {
      setTesting(false);
    }
  };

  const handleTestLmStudioConnection = async () => {
    if (!lmStudioEndpoint) {
      setMessage("Please enter the LM Studio endpoint");
      setMessageType("error");
      return;
    }

    setTestingLmStudio(true);
    setMessage("");
    try {
      const response = await fetch("/api/lm-studio/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: lmStudioEndpoint }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`Success: ${data.message}`);
        setMessageType("success");
        if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
        }
      } else {
        setMessage(`Error: ${data.error || "Connection failed"}`);
        setMessageType("error");
      }
    } catch (err) {
      setMessage(
        "Error: Connection failed. Make sure LM Studio is running and the endpoint is correct"
      );
      setMessageType("error");
    } finally {
      setTestingLmStudio(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate default day length
    const dayLengthNum = parseFloat(defaultDayLength);
    if (isNaN(dayLengthNum) || dayLengthNum <= 0 || dayLengthNum > 24) {
      setMessage("Default day length must be between 0 and 24 hours");
      setMessageType("error");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      // Save general settings
      const generalResponse = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "default_day_length",
          value: defaultDayLength,
        }),
      });

      if (!generalResponse.ok) {
        throw new Error("Failed to save general settings");
      }

      // Save Azure DevOps settings
      const azureResponse = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "azure_devops",
          value: { organization, project, pat },
        }),
      });

      if (!azureResponse.ok) {
        throw new Error("Failed to save Azure DevOps settings");
      }

      // Save LM Studio settings
      const lmStudioResponse = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "lm_studio",
          value: {
            endpoint: lmStudioEndpoint,
            model: lmStudioModel === "__default__" ? "" : lmStudioModel,
          },
        }),
      });

      if (!lmStudioResponse.ok) {
        throw new Error("Failed to save LM Studio settings");
      }

      setMessage("Settings saved successfully.");
      setMessageType("success");

      if (onSaved) {
        window.setTimeout(() => {
          onSaved();
        }, 1500);
      }
    } catch (err) {
      setMessage("Failed to save settings.");
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  const formatBackupSize = (sizeBytes: number) => {
    if (sizeBytes < 1024) {
      return `${sizeBytes} B`;
    }
    if (sizeBytes < 1024 * 1024) {
      return `${(sizeBytes / 1024).toFixed(1)} KB`;
    }
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    setMessage("");

    try {
      const response = await fetch("/api/database/backups", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create backup");
      }

      await loadBackups();
      setSelectedBackup(data.fileName);
      setMessage(`Database backup created: ${data.fileName}`);
      setMessageType("success");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create database backup.";
      setMessage(errorMessage);
      setMessageType("error");
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) {
      setMessage("Please select a backup file to restore.");
      setMessageType("error");
      return;
    }

    const confirmed = window.confirm(
      `Restore database from ${selectedBackup}? This will replace current data in this database.`
    );

    if (!confirmed) {
      return;
    }

    setRestoringBackup(true);
    setMessage("");

    try {
      const response = await fetch("/api/database/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: selectedBackup }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to restore backup");
      }

      setMessage(`Database restored from ${selectedBackup}. Refresh to see updated data.`);
      setMessageType("success");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to restore database backup.";
      setMessage(errorMessage);
      setMessageType("error");
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleDeleteBackup = async () => {
    if (!selectedBackup) {
      setMessage("Please select a backup file to delete.");
      setMessageType("error");
      return;
    }

    const confirmed = window.confirm(
      `Delete backup ${selectedBackup}? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingBackup(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/database/backups?fileName=${encodeURIComponent(selectedBackup)}`,
        { method: "DELETE" }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete backup");
      }

      const deletedFile = selectedBackup;
      await loadBackups();
      setMessage(`Backup deleted: ${deletedFile}`);
      setMessageType("success");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete database backup.";
      setMessage(errorMessage);
      setMessageType("error");
    } finally {
      setDeletingBackup(false);
    }
  };

  const resetPasswordDialog = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleOpenChangePassword = () => {
    resetPasswordDialog();
    setShowChangePassword(true);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage("Please fill in all password fields.");
      setMessageType("error");
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage("New password and confirmation do not match.");
      setMessageType("error");
      return;
    }

    if (newPassword.length < 8) {
      setMessage("New password must be at least 8 characters long.");
      setMessageType("error");
      return;
    }

    setChangingPassword(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as ApiError;
        setMessage(data.error || "Failed to change password.");
        setMessageType("error");
        return;
      }

      setShowChangePassword(false);
      resetPasswordDialog();
      setMessage("Password updated successfully.");
      setMessageType("success");
    } catch {
      setMessage("Failed to change password.");
      setMessageType("error");
    } finally {
      setChangingPassword(false);
    }
  };

  return loading ? (
    <div className="text-center py-8">Loading settings...</div>
  ) : (
    <form onSubmit={handleSave}>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="releases">Releases</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="azure">Azure DevOps</TabsTrigger>
          <TabsTrigger value="ai">AI (LM Studio)</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="activeUser">Active User</Label>
            <Select
              value={activeUserId}
              onValueChange={handleSwitchUser}
              disabled
            >
              <SelectTrigger id="activeUser">
                <SelectValue placeholder={loadingUsers ? "Loading users..." : "Select user"} />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={String(user.id)}>
                    <div className="flex items-center gap-2">
                      <UserAvatar name={user.name} className="h-5 w-5 text-[9px]" />
                      <span>{user.name} {user.email ? `(${user.email})` : ""}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Active user is derived from the current sign-in session.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border p-2">
            <UserAvatar
              name={users.find((user) => String(user.id) === activeUserId)?.name}
              className="h-8 w-8 text-xs"
            />
            <p className="text-sm font-medium">
              {users.find((user) => String(user.id) === activeUserId)?.name || "No user selected"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenCreateUser}
              disabled={creatingUser || updatingUser || loadingUsers}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {creatingUser ? "Creating..." : "Add User"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenRenameUser}
              disabled={!activeUserId || creatingUser || updatingUser || loadingUsers}
              className="gap-2"
            >
              <UserPen className="h-4 w-4" />
              Rename User
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={!activeUserId || users.length <= 1 || creatingUser || updatingUser || loadingUsers}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Remove User
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleOpenChangePassword}
              disabled={!activeUserId || changingPassword}
            >
              Change Password
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="general" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="defaultDayLength">Default Day Length (hours)</Label>
            <Input
              id="defaultDayLength"
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              value={defaultDayLength}
              onChange={(e) => setDefaultDayLength(e.target.value)}
              placeholder="8"
              required
            />
            <p className="text-xs text-muted-foreground">
              Set the default number of hours in a working day (used for
              calculations)
            </p>
          </div>
        </TabsContent>

        <TabsContent value="releases" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="releaseName">Create Release</Label>
            <div className="flex gap-2">
              <Input
                id="releaseName"
                value={releaseName}
                onChange={(event) => setReleaseName(event.target.value)}
                placeholder="e.g., Q2 Launch"
              />
              <Button
                type="button"
                onClick={handleCreateRelease}
                disabled={creatingRelease}
              >
                {creatingRelease ? "Creating..." : "Create release"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              New releases default to today for start/end dates. Reorder releases by dragging rows.
            </p>
          </div>

          {loadingReleases ? (
            <div className="text-sm text-muted-foreground">Loading releases...</div>
          ) : sortedReleases.length === 0 ? (
            <div className="text-sm text-muted-foreground">No releases yet.</div>
          ) : (
            <DndContext
              sensors={releaseSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleReleaseDragEnd}
            >
              <SortableContext
                items={sortedReleases.map((release) => release.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {sortedReleases.map((release) => (
                    <SortableReleaseRow
                      key={release.id}
                      id={release.id}
                      release={release}
                      onRename={handleRenameRelease}
                      onMarkCompleted={handleMarkReleaseCompleted}
                      updatingReleaseId={updatingReleaseId}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </TabsContent>

        <TabsContent value="database" className="space-y-4 mt-4">
          <div className="space-y-3 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="databaseBackupSelect">Database Backups</Label>
              <p className="text-xs text-muted-foreground">
                Create separate snapshot files and restore from them when needed.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCreateBackup}
                disabled={creatingBackup || deletingBackup || saving || restoringBackup}
              >
                {creatingBackup ? "Creating Backup..." : "Create Backup"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={loadBackups}
                disabled={loadingBackups || creatingBackup || deletingBackup || restoringBackup || saving}
              >
                {loadingBackups ? "Refreshing..." : "Refresh Backups"}
              </Button>
            </div>

            <div className="space-y-2">
              <Select
                value={selectedBackup}
                onValueChange={setSelectedBackup}
                disabled={loadingBackups || backups.length === 0 || creatingBackup || deletingBackup || restoringBackup}
              >
                <SelectTrigger id="databaseBackupSelect">
                  <SelectValue placeholder={loadingBackups ? "Loading backups..." : "Select backup file"} />
                </SelectTrigger>
                <SelectContent>
                  {backups.map((backup) => (
                    <SelectItem key={backup.fileName} value={backup.fileName}>
                      {backup.fileName} ({formatBackupSize(backup.sizeBytes)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {backups.length === 0
                  ? "No backup files found."
                  : `Latest backup: ${new Date(backups[0].createdAt).toLocaleString()}`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteBackup}
                disabled={!selectedBackup || deletingBackup || restoringBackup || creatingBackup || saving}
              >
                {deletingBackup ? "Deleting..." : "Delete Selected Backup"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleRestoreBackup}
                disabled={!selectedBackup || restoringBackup || deletingBackup || creatingBackup || saving}
              >
                {restoringBackup ? "Restoring..." : "Restore Selected Backup"}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="azure" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="organization">Organization</Label>
            <Input
              id="organization"
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="e.g., mycompany"
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
            />
            <p className="text-xs text-muted-foreground">
              Create a PAT at: User Settings -&gt; Personal access tokens -&gt; New
              Token (needs Work Items: Read scope)
            </p>
          </div>

          <Button
            type="button"
            onClick={handleTestAzureConnection}
            disabled={testing || saving}
            variant="outline"
            className="w-full border-blue-600 text-blue-600 hover:bg-blue-50"
          >
            {testing ? "Testing..." : "Test Connection"}
          </Button>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="lmStudioEndpoint">LM Studio Endpoint</Label>
            <Input
              id="lmStudioEndpoint"
              type="text"
              value={lmStudioEndpoint}
              onChange={(e) => setLmStudioEndpoint(e.target.value)}
              placeholder="http://localhost:1234"
            />
            <p className="text-xs text-muted-foreground">
              The URL where LM Studio server is running (default:
              http://localhost:1234)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lmStudioModel">Model</Label>
            <Select
              value={lmStudioModel}
              onValueChange={setLmStudioModel}
              disabled={loadingModels}
            >
              <SelectTrigger id="lmStudioModel">
                <SelectValue
                  placeholder={
                    loadingModels
                      ? "Loading models..."
                      : "Select a model (or use default)"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">
                  Use default loaded model
                </SelectItem>
                {availableModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {availableModels.length === 0
                ? "Test connection to load available models"
                : `${availableModels.length} model(s) available`}
            </p>
          </div>

          <Button
            type="button"
            onClick={handleTestLmStudioConnection}
            disabled={testingLmStudio || saving}
            variant="outline"
            className="w-full border-purple-600 text-purple-600 hover:bg-purple-50"
          >
            {testingLmStudio ? "Testing..." : "Test Connection"}
          </Button>

          <div className="rounded-lg border p-3 bg-muted/50">
            <p className="text-xs text-muted-foreground">
              <strong>Setup:</strong> Download and run LM Studio, load a model,
              then start the local server (default port: 1234). This enables
              AI-powered checklist generation from text.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {message && (
        <Alert
          variant={messageType === "success" ? "default" : "destructive"}
          className={
            messageType === "success"
              ? "bg-green-50 border-green-200 mt-4"
              : "mt-4"
          }
        >
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <Dialog
        open={showCreateUser}
        onOpenChange={(open) => {
          setShowCreateUser(open);
          if (!open) {
            resetCreateUserDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User</DialogTitle>
            <DialogDescription>
              Enter email and optional display name. Temporary password will be sent by email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="newUserEmail">Email</Label>
              <Input
                id="newUserEmail"
                type="email"
                value={newUserEmail}
                onChange={(event) => setNewUserEmail(event.target.value)}
                disabled={creatingUser}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newUserName">Name (optional)</Label>
              <Input
                id="newUserName"
                type="text"
                value={newUserName}
                onChange={(event) => setNewUserName(event.target.value)}
                disabled={creatingUser}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateUser(false)}
              disabled={creatingUser}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateUser}
              disabled={creatingUser}
            >
              {creatingUser ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showRenameUser}
        onOpenChange={(open) => {
          setShowRenameUser(open);
          if (!open) {
            setRenameUserName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename User</DialogTitle>
            <DialogDescription>
              Set a new display name for the selected user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="renameUserName">Name</Label>
            <Input
              id="renameUserName"
              type="text"
              value={renameUserName}
              onChange={(event) => setRenameUserName(event.target.value)}
              disabled={updatingUser}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowRenameUser(false)}
              disabled={updatingUser}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleRenameUser}
              disabled={updatingUser}
            >
              {updatingUser ? "Saving..." : "Save Name"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showChangePassword}
        onOpenChange={(open) => {
          setShowChangePassword(open);
          if (!open) {
            resetPasswordDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and set a new one.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                disabled={changingPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={changingPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={changingPassword}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowChangePassword(false)}
              disabled={changingPassword}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleChangePassword}
              disabled={changingPassword}
            >
              {changingPassword ? "Saving..." : "Save Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {showCancel && (
          <Button
            type="button"
            onClick={() => onCancel?.()}
            disabled={saving}
            variant="secondary"
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </form>
  );
}
