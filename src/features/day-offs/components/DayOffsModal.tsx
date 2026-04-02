"use client";

import { useState } from "react";
import { format } from "date-fns";
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
import type { DayOff } from "@/types";

interface DayOffsModalProps {
  onClose: () => void;
  onSuccess: () => void;
  currentDayOffs: DayOff[];
}

export function DayOffsModal({
  onClose,
  onSuccess,
  currentDayOffs,
}: DayOffsModalProps) {
  const [activeTab, setActiveTab] = useState<"manual" | "import">("manual");
  const [isRangeMode, setIsRangeMode] = useState(false);
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importFileContent, setImportFileContent] = useState("");
  const [importFileInputKey, setImportFileInputKey] = useState(0);
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
              body: JSON.stringify({ date: dateStr, description: description || null, isHalfDay }),
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
          body: JSON.stringify({ date, description: description || null, isHalfDay }),
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
      setIsHalfDay(false);
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

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];

    if (!file) {
      setImportFileName("");
      setImportFileContent("");
      return;
    }

    try {
      const content = await file.text();
      setImportFileName(file.name);
      setImportFileContent(content);
      setMessage("");
    } catch (err) {
      console.error(err);
      setImportFileName("");
      setImportFileContent("");
      setMessage("✗ Failed to read the selected ICS file");
      setMessageType("error");
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const hasUrl = importUrl.trim().length > 0;
    const hasFile = importFileContent.trim().length > 0;

    if (!hasUrl && !hasFile) {
      setMessage("✗ Provide either a calendar URL or an ICS file");
      setMessageType("error");
      return;
    }

    if (hasUrl && hasFile) {
      setMessage("✗ Use either a calendar URL or an ICS file, not both");
      setMessageType("error");
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/day-offs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: hasUrl ? importUrl.trim() : null,
          fileContent: hasFile ? importFileContent : null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to import ICS calendar");
      }

      setMessage(
        `✓ Imported ${data.added} holiday(s)${
          data.skipped > 0 ? `, skipped ${data.skipped} existing date(s)` : ""
        }`
      );
      setMessageType("success");
      setImportUrl("");
      setImportFileName("");
      setImportFileContent("");
      setImportFileInputKey((current) => current + 1);
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

        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value as "manual" | "import");
            setMessage("");
          }}
          className="space-y-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="import">Import ICS</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4">
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

              <div className="space-y-2">
                <Label>Duration</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={!isHalfDay ? "default" : "outline"}
                    onClick={() => setIsHalfDay(false)}
                    className="flex-1"
                  >
                    Full day
                  </Button>
                  <Button
                    type="button"
                    variant={isHalfDay ? "default" : "outline"}
                    onClick={() => setIsHalfDay(true)}
                    className="flex-1"
                  >
                    Half day
                  </Button>
                </div>
                {isHalfDay && (
                  <p className="text-xs text-muted-foreground">
                    Counts as half of your default work day.
                  </p>
                )}
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
                  <Label htmlFor="range-description">Description (optional)</Label>
                  <Input
                    id="range-description"
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
            </form>
          </TabsContent>

          <TabsContent value="import" className="space-y-4">
            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="import-url">Calendar URL</Label>
                <Input
                  id="import-url"
                  type="url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder="https://example.com/holidays.ics"
                  disabled={submitting}
                />
                <p className="text-xs text-muted-foreground">
                  Use a public `.ics` URL or upload an ICS file below.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="import-file">ICS File</Label>
                <Input
                  key={importFileInputKey}
                  id="import-file"
                  type="file"
                  accept=".ics,text/calendar"
                  onChange={handleImportFileChange}
                  disabled={submitting}
                />
                {importFileName && (
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>Selected file: {importFileName}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => {
                        setImportFileName("");
                        setImportFileContent("");
                        setImportFileInputKey((current) => current + 1);
                      }}
                    >
                      Clear file
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                Imported dates are attached to the current user and shown in the
                tracker the same way as manually added holidays. Existing dates
                are skipped.
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Importing..." : "Import Holidays from ICS"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {message && (
          <Alert
            variant={messageType === "success" ? "default" : "destructive"}
            className={
              messageType === "success" ? "border-green-200 bg-green-50" : ""
            }
          >
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {currentDayOffs.length > 0 && (
          <div className="space-y-2 mt-4">
            <h3 className="font-semibold text-sm text-gray-700">
              Current Day-Offs ({currentDayOffs.length})
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
                    <div className="text-xs text-gray-600">
                      {dayOff.is_half_day ? "Half day" : "Full day"}
                      {dayOff.description ? ` • ${dayOff.description}` : ""}
                    </div>
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
