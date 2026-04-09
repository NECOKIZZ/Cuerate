export function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return '.'.repeat(maxLength);
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
