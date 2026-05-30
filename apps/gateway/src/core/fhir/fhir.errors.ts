import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AxiosError } from 'axios';
import type { OperationOutcome } from 'fhir/r4';

function isOperationOutcome(data: unknown): data is OperationOutcome {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { resourceType?: unknown }).resourceType === 'OperationOutcome'
  );
}

/** Condense an OperationOutcome into a short message (error/fatal issues only). */
function summarizeOutcome(outcome: OperationOutcome): string {
  const messages = (outcome.issue ?? [])
    .filter((issue) => issue.severity === 'error' || issue.severity === 'fatal')
    .map((issue) => issue.diagnostics ?? issue.code);
  return messages.length > 0 ? messages.join('; ') : 'FHIR operation failed';
}

/**
 * Translates a failed HAPI call into a clean Nest HttpException, preferring the
 * OperationOutcome diagnostics when present. A missing HTTP response means HAPI
 * is unreachable (network/timeout), surfaced as 503.
 */
export function mapFhirError(error: unknown): HttpException {
  if (error instanceof HttpException) {
    return error;
  }

  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const data: unknown = error.response?.data;
    const message = isOperationOutcome(data) ? summarizeOutcome(data) : error.message;

    if (status === undefined) {
      return new ServiceUnavailableException(
        `FHIR server unreachable (${error.code ?? 'network error'})`,
      );
    }

    switch (status) {
      case 400:
        return new BadRequestException(message);
      case 401:
        return new UnauthorizedException(message);
      case 403:
        return new ForbiddenException(message);
      case 404:
        return new NotFoundException(message);
      case 409:
      case 412:
        return new ConflictException(message);
      case 422:
        return new UnprocessableEntityException(message);
      default:
        return status >= 500
          ? new BadGatewayException(`FHIR server error: ${message}`)
          : new InternalServerErrorException(message);
    }
  }

  return new InternalServerErrorException('Unexpected FHIR client error');
}
