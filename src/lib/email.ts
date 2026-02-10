import { spawnSync } from "child_process";

interface SendCredentialsEmailInput {
  to: string;
  name: string;
  password: string;
}

const getSenderAddress = () =>
  process.env.SMTP_FROM || "no-reply@project-manager.local";

const buildCredentialsMessage = ({
  to,
  name,
  password,
}: SendCredentialsEmailInput) => {
  const subject = "Your Project Manager account credentials";
  const text = [
    `Hello${name ? ` ${name}` : ""},`,
    "",
    "Your account in Project Manager has been created.",
    "",
    `Email: ${to}`,
    `Temporary password: ${password}`,
    "",
    "Please sign in and change your password as soon as possible.",
  ].join("\n");

  return [
    `From: ${getSenderAddress()}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
  ].join("\n");
};

export const sendNewUserCredentialsEmail = (input: SendCredentialsEmailInput) => {
  const message = buildCredentialsMessage(input);
  const result = spawnSync("/usr/sbin/sendmail", ["-t", "-i"], {
    input: message,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || "Failed to send email via sendmail");
  }
};
