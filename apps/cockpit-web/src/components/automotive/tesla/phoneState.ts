export function appendDialDigit(current: string, digit: string): string {
  return /^[0-9*#]$/.test(digit) && current.length < 15 ? current + digit : current
}
