/** Restricts SMTP delivery without changing the in-app notification routes. */
export class RecipientAllowlist {
  private readonly recipients: ReadonlySet<string>;
  private readonly unrestricted: boolean;

  constructor(value?: string) {
    this.unrestricted = !value?.trim();
    this.recipients = new Set(
      (value ?? '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  allows(email: string): boolean {
    return this.unrestricted || this.recipients.has(email.trim().toLowerCase());
  }
}
