"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GeneralSettingsForm } from "@/features/settings/components/GeneralSettingsForm";

interface GeneralSettingsModalProps {
  onClose: () => void;
}

export function GeneralSettingsModal({ onClose }: GeneralSettingsModalProps) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your application settings
          </DialogDescription>
        </DialogHeader>
        <GeneralSettingsForm
          onCancel={onClose}
          onSaved={onClose}
          showCancel
        />
      </DialogContent>
    </Dialog>
  );
}
