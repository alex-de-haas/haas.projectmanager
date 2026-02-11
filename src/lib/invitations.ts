import crypto from "crypto";

export const INVITATION_EXPIRY_SECONDS = 60 * 60 * 24 * 7;

export const createInvitationToken = (): string => {
  return crypto.randomBytes(32).toString("base64url");
};

export const hashInvitationToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

