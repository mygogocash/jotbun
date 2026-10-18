/**
 * A startup configuration problem whose message is fixed text written in
 * this repository: setting names, allowed ranges, role names. Never put a
 * configured value, URL, key or user input in it. It is the only error whose
 * message describeFailure prints (P6b review); every other failure is logged
 * by its class name or code alone.
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
