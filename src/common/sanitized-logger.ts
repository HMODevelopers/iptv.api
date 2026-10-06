import { ConsoleLogger, LogLevel } from '@nestjs/common';

/** Framework errors can contain driver credentials or connection details. */
export class SanitizedLogger extends ConsoleLogger {
  constructor(levels: LogLevel[]) { super({ logLevels: levels }); }
  override error(message: unknown, ...optionalParams: unknown[]): void {
    // Application-generated error messages are deliberately allowlisted.
    const safe = typeof message === 'string' && (
      /^Lote \d+ revertido; no se registran datos sensibles$/.test(message) ||
      /^HTTP \d+ [A-Z]+; detalles internos omitidos$/.test(message)
    );
    const context = optionalParams.at(-1);
    super.error(safe ? message : 'Operación fallida; revisa configuración y conectividad. Detalles internos omitidos.',
      typeof context === 'string' && /^[A-Za-z]+$/.test(context) ? context : 'Application');
  }
}
