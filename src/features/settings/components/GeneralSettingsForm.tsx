"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export function GeneralSettingsForm({
  onCancel,
  onSaved,
  showCancel = false,
}: GeneralSettingsFormProps) {
  // General settings
  const [defaultDayLength, setDefaultDayLength] = useState("8");

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

  useEffect(() => {
    loadSettings();
    loadBackups();
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

  return loading ? (
    <div className="text-center py-8">Loading settings...</div>
  ) : (
    <form onSubmit={handleSave}>
      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="database">Database</TabsTrigger>
          <TabsTrigger value="azure">Azure DevOps</TabsTrigger>
          <TabsTrigger value="ai">AI (LM Studio)</TabsTrigger>
        </TabsList>

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
