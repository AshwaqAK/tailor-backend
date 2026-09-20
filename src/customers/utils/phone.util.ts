export function normalizePhone(phone: string): string {
  const value = phone.trim();

  if (value.startsWith('+91')) {
    const digits = value.slice(3).replace(/\D/g, '');

    if (digits.length === 10) {
      return `+91${digits}`;
    }
  }

  const digits = value.replace(/\D/g, '');

  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91${digits}`;
  }

  if (digits.length === 12 && digits.startsWith('91')) {
    const mobileNumber = digits.slice(2);

    if (/^[6-9]\d{9}$/.test(mobileNumber)) {
      return `+91${mobileNumber}`;
    }
  }

  return value;
}
