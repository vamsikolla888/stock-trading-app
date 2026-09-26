import { displayNameFromEmail, initialsFromEmail } from '@/lib/utils/user';

describe('user identity from email', () => {
  it('derives a display name from the local part', () => {
    expect(displayNameFromEmail('vamsi.krishna@example.com')).toBe('Vamsi Krishna');
    expect(displayNameFromEmail('trader_01@example.com')).toBe('Trader');
    expect(displayNameFromEmail('JANE-DOE@example.com')).toBe('Jane Doe');
  });

  it('falls back to the email when there are no letters', () => {
    expect(displayNameFromEmail('1234@example.com')).toBe('1234@example.com');
  });

  it('builds initials', () => {
    expect(initialsFromEmail('vamsi.krishna@example.com')).toBe('VK');
    expect(initialsFromEmail('solo@example.com')).toBe('S');
    expect(initialsFromEmail(null)).toBe('?');
  });
});
