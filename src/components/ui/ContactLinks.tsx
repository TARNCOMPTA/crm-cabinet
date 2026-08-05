import { Mail, Phone } from 'lucide-react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s+\-().]+$/;

interface EmailLinkProps {
  email: string;
}

export function EmailLink({ email }: EmailLinkProps) {
  const trimmed = email?.trim();
  if (!trimmed || !EMAIL_REGEX.test(trimmed)) return null;

  return (
    <a
      href={`mailto:${trimmed}`}
      className="inline-flex items-center gap-1.5 text-teal-600 hover:text-teal-700 hover:underline transition-colors"
      title={`Envoyer un email à ${trimmed}`}
    >
      <Mail className="w-4 h-4" />
      <span>{trimmed}</span>
    </a>
  );
}

interface PhoneLinkProps {
  phone: string;
}

export function PhoneLink({ phone }: PhoneLinkProps) {
  const trimmed = phone?.trim();
  if (!trimmed || !PHONE_REGEX.test(trimmed)) return null;

  return (
    <a
      href={`tel:${trimmed}`}
      className="inline-flex items-center gap-1.5 text-teal-600 hover:text-teal-700 hover:underline transition-colors"
      title={`Appeler ${trimmed}`}
    >
      <Phone className="w-4 h-4" />
      <span>{trimmed}</span>
    </a>
  );
}
