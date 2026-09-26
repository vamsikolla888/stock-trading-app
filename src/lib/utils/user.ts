/** The server stores no display name — derive a friendly one from the email's local part. */
export function displayNameFromEmail(email: string | null | undefined): string {
  if (!email) return '';
  const local = email.split('@')[0] ?? '';
  const words = local.split(/[._\-+\d]+/).filter(Boolean);
  if (words.length === 0) return email;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

/** Up to two initials for the avatar ("vamsi.k@…" → "VK"). */
export function initialsFromEmail(email: string | null | undefined): string {
  const name = displayNameFromEmail(email);
  const parts = name.split(' ').filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return initials || '?';
}
