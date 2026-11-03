/** First letters of the first two name parts, e.g. "Zeyad El Maghraby" -> "ZE". */
export function getInitials(displayName?: string): string {
  if (!displayName) {
    return '';
  }
  return displayName
    .split(' ')
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
