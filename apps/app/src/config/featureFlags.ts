export function isSpendEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_SPEND !== '0';
}
