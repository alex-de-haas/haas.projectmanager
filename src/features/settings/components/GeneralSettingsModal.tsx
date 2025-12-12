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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface GeneralSettingsModalProps {
  onClose: () => void;
}

export function GeneralSettingsModal({ onClose }: GeneralSettingsModalProps) {
  // General settings
  const [defaultDayLength, setDefaultDayLength] = useState("8");

  // Azure DevOps settings
  const [organization, setOrganization] = useState("");
  const [project, setProject] = useState("");
  const [pat, setPat] = useState("");

  // LM Studio settings
  const [lmStudioEndpoint, setLmStudioEndpoint] = useState("http://localhost:1234");
  const [lmStudioModel, setLmStudioModel] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingLmStudio, setTestingLmStudio] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // Load general settings
      const generalResponse = await fetch("/api/settings?key=default_day_length");
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
          setLmStudioModel(settings.model || "");
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
        setMessage(`✓ ${data.message}`);
        setMessageType("success");
      } else {
        setMessage(`✗ ${data.error || "Connection failed"}`);
        setMessageType("error");
      }
    } catch (err) {
      setMessage("✗ Connection failed: Make sure LM Studio is running and the endpoint is correct");
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

      if (!generalResponse.ok) throw new Error("Failed to save general settings");

      // Save Azure DevOps settings
      const azureResponse = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "azure_devops",
          value: { organization, project, pat },
        }),
      });

      if (!azureResponse.ok) throw new Error("Failed to save Azure DevOps settings");

      // Save LM Studio settings
      const lmStudioResponse = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "lm_studio",
          value: { endpoint: lmStudioEndpoint, model: lmStudioModel },
        }),
      });

      if (!lmStudioResponse.ok) throw new Error("Failed to save LM Studio settings");

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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your application settings
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="text-center py-8">Loading settings...</div>
        ) : (
          <form onSubmit={handleSave}>
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
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
                    Set the default number of hours in a working day (used for calculations)
                  </p>
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
                    Create a PAT at: User Settings → Personal access tokens → New
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
                    The URL where LM Studio server is running (default: http://localhost:1234)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lmStudioModel">Model Name (optional)</Label>
                  <Input
                    id="lmStudioModel"
                    type="text"
                    value={lmStudioModel}
                    onChange={(e) => setLmStudioModel(e.target.value)}
                    placeholder="e.g., qwen2.5-coder-7b-instruct"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the default loaded model in LM Studio
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
                    then start the local server (default port: 1234). 
                    This enables AI-powered checklist generation from text.
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

            <DialogFooter className="mt-6">
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
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
