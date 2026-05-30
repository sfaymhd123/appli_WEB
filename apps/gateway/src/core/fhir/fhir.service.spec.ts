import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AxiosError, type AxiosResponse } from 'axios';
import type { Bundle, OperationOutcome, Patient } from 'fhir/r4';

import { FHIR_HTTP_CLIENT } from './fhir.constants';
import { FhirService, type JsonPatchOperation } from './fhir.service';

type MockHttp = {
  get: jest.Mock;
  post: jest.Mock;
  put: jest.Mock;
  patch: jest.Mock;
};

/** Minimal AxiosError carrying an HTTP response — the mapper only reads status + data. */
function httpError(status: number, data: unknown): AxiosError {
  const response = { status, data } as AxiosResponse;
  return new AxiosError('request failed', 'ERR_BAD_RESPONSE', undefined, undefined, response);
}

function outcome(code: string, diagnostics: string): OperationOutcome {
  return { resourceType: 'OperationOutcome', issue: [{ severity: 'error', code, diagnostics }] };
}

describe('FhirService', () => {
  let service: FhirService;
  let http: MockHttp;

  beforeEach(async () => {
    http = { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [FhirService, { provide: FHIR_HTTP_CLIENT, useValue: http }],
    }).compile();
    service = moduleRef.get(FhirService);
  });

  describe('happy paths', () => {
    it('create POSTs to /{type} with return=representation and returns the stored resource', async () => {
      const patient: Patient = { resourceType: 'Patient', name: [{ family: 'Test' }] };
      const stored: Patient = { ...patient, id: 'abc' };
      http.post.mockResolvedValue({ data: stored, status: 201 });

      const result = await service.create(patient);

      expect(http.post).toHaveBeenCalledWith(
        '/Patient',
        patient,
        expect.objectContaining({ headers: { Prefer: 'return=representation' } }),
      );
      expect(result).toBe(stored);
    });

    it('read GETs /{type}/{id}', async () => {
      const stored: Patient = { resourceType: 'Patient', id: 'abc' };
      http.get.mockResolvedValue({ data: stored, status: 200 });

      const result = await service.read<Patient>('Patient', 'abc');

      expect(http.get).toHaveBeenCalledWith('/Patient/abc');
      expect(result).toBe(stored);
    });

    it('update PUTs /{type}/{id}', async () => {
      const patient: Patient = { resourceType: 'Patient', id: 'abc', active: true };
      http.put.mockResolvedValue({ data: patient, status: 200 });

      const result = await service.update(patient);

      expect(http.put).toHaveBeenCalledWith('/Patient/abc', patient, expect.any(Object));
      expect(result).toBe(patient);
    });

    it('patch sends a JSON Patch body with the json-patch+json content type', async () => {
      const ops: JsonPatchOperation[] = [{ op: 'replace', path: '/active', value: false }];
      http.patch.mockResolvedValue({ data: { resourceType: 'Patient', id: 'abc' }, status: 200 });

      await service.patch('Patient', 'abc', ops);

      expect(http.patch).toHaveBeenCalledWith(
        '/Patient/abc',
        ops,
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json-patch+json' }),
        }),
      );
    });

    it('search GETs /{type} with params and returns a Bundle', async () => {
      const bundle: Bundle<Patient> = { resourceType: 'Bundle', type: 'searchset', total: 0, entry: [] };
      http.get.mockResolvedValue({ data: bundle, status: 200 });

      const result = await service.search<Patient>('Patient', { name: 'Test', _count: 10 });

      expect(http.get).toHaveBeenCalledWith('/Patient', { params: { name: 'Test', _count: 10 } });
      expect(result.type).toBe('searchset');
    });

    it('operationEverything maps opts to $everything query params', async () => {
      const bundle: Bundle = { resourceType: 'Bundle', type: 'searchset' };
      http.get.mockResolvedValue({ data: bundle, status: 200 });

      await service.operationEverything('abc', { count: 50, types: ['Observation', 'Condition'] });

      expect(http.get).toHaveBeenCalledWith('/Patient/abc/$everything', {
        params: { _count: 50, _type: 'Observation,Condition' },
      });
    });
  });

  describe('error mapping', () => {
    it('throws without an id on update (no HTTP call)', async () => {
      await expect(service.update({ resourceType: 'Patient' } as Patient)).rejects.toThrow(/requires resource\.id/);
      expect(http.put).not.toHaveBeenCalled();
    });

    it('maps 404 + OperationOutcome to NotFoundException with diagnostics', async () => {
      http.get.mockRejectedValue(httpError(404, outcome('not-found', 'Patient/x not found')));

      await expect(service.read('Patient', 'x')).rejects.toMatchObject({
        status: 404,
        message: 'Patient/x not found',
      });
      await expect(service.read('Patient', 'x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps 400 to BadRequestException', async () => {
      http.post.mockRejectedValue(httpError(400, outcome('invalid', 'bad resource')));

      await expect(service.create({ resourceType: 'Patient' } as Patient)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('maps a 5xx to BadGatewayException', async () => {
      http.get.mockRejectedValue(httpError(500, outcome('exception', 'boom')));

      await expect(service.read('Patient', 'x')).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('maps a network error (no response) to ServiceUnavailableException', async () => {
      http.get.mockRejectedValue(new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED'));

      await expect(service.read('Patient', 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
