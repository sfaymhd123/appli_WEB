import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AxiosInstance } from 'axios';
import type { Bundle, CapabilityStatement, Resource } from 'fhir/r4';

import { FHIR_HTTP_CLIENT } from './fhir.constants';
import { mapFhirError } from './fhir.errors';

export type SearchParams = Record<string, string | number | boolean | Array<string | number>>;

export interface EverythingOptions {
  /** _count — max resources per page. */
  count?: number;
  /** _since — ISO instant; only resources changed at/after this time. */
  since?: string;
  /** _type — restrict the bundle to these resource types. */
  types?: string[];
}

/** RFC 6902 JSON Patch operation. */
export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

/**
 * The gateway's single door to HAPI FHIR (ARCH.md §9). Every HAPI call goes
 * through here; modules must never call HAPI directly.
 *
 * PHI safety: logs carry resource types and logical ids only — never patient
 * identifiers, vitals, tokens, or query strings (which may embed identifiers).
 */
@Injectable()
export class FhirService {
  private readonly logger = new Logger(FhirService.name);

  constructor(@Inject(FHIR_HTTP_CLIENT) private readonly http: AxiosInstance) {}

  async create<T extends Resource>(resource: T): Promise<T> {
    const type = resource.resourceType;
    try {
      const { data, status } = await this.http.post<T>(`/${type}`, resource, {
        headers: { Prefer: 'return=representation' },
      });
      this.logger.log(`POST /${type} -> ${status}`);
      return data;
    } catch (error) {
      throw this.fail('POST', `/${type}`, error);
    }
  }

  /**
   * Idempotent create via FHIR conditional-create (`If-None-Exist`). HAPI runs
   * the supplied search; if it matches an existing resource it returns that one
   * (HTTP 200) instead of inserting a duplicate, otherwise it creates (HTTP 201).
   * Used for offline-replay safety (ARCH.md §8): a queued write carrying a
   * stable client-request-id identifier upserts rather than duplicates.
   *
   * @param ifNoneExist a FHIR search query, e.g. `identifier=<system>|<value>`.
   * @returns the resource plus whether it was newly created (so callers can skip
   *          one-shot side effects — alerts, SMS, timers — on a replay).
   */
  async conditionalCreate<T extends Resource>(
    resource: T,
    ifNoneExist: string,
  ): Promise<{ resource: T; created: boolean }> {
    const type = resource.resourceType;
    try {
      const { data, status } = await this.http.post<T>(`/${type}`, resource, {
        headers: { Prefer: 'return=representation', 'If-None-Exist': ifNoneExist },
      });
      const created = status === 201;
      this.logger.log(`POST /${type} (conditional) -> ${status} (${created ? 'created' : 'matched'})`);
      return { resource: data, created };
    } catch (error) {
      throw this.fail('POST', `/${type} (conditional)`, error);
    }
  }

  async read<T extends Resource>(resourceType: string, id: string): Promise<T> {
    try {
      const { data, status } = await this.http.get<T>(`/${resourceType}/${id}`);
      this.logger.log(`GET /${resourceType}/${id} -> ${status}`);
      return data;
    } catch (error) {
      throw this.fail('GET', `/${resourceType}/${id}`, error);
    }
  }

  async update<T extends Resource>(resource: T): Promise<T> {
    const type = resource.resourceType;
    const { id } = resource;
    if (!id) {
      throw new Error('FhirService.update requires resource.id (use create for new resources)');
    }
    try {
      const { data, status } = await this.http.put<T>(`/${type}/${id}`, resource, {
        headers: { Prefer: 'return=representation' },
      });
      this.logger.log(`PUT /${type}/${id} -> ${status}`);
      return data;
    } catch (error) {
      throw this.fail('PUT', `/${type}/${id}`, error);
    }
  }

  async patch<T extends Resource = Resource>(
    resourceType: string,
    id: string,
    operations: JsonPatchOperation[],
  ): Promise<T> {
    try {
      const { data, status } = await this.http.patch<T>(`/${resourceType}/${id}`, operations, {
        headers: {
          'Content-Type': 'application/json-patch+json',
          Prefer: 'return=representation',
        },
      });
      this.logger.log(`PATCH /${resourceType}/${id} -> ${status}`);
      return data;
    } catch (error) {
      throw this.fail('PATCH', `/${resourceType}/${id}`, error);
    }
  }

  async search<T extends Resource = Resource>(
    resourceType: string,
    params: SearchParams = {},
  ): Promise<Bundle<T>> {
    try {
      const { data, status } = await this.http.get<Bundle<T>>(`/${resourceType}`, { params });
      const hits = data.total ?? data.entry?.length ?? 0;
      this.logger.log(`GET /${resourceType}?<search> -> ${status} (${hits} hits)`);
      return data;
    } catch (error) {
      throw this.fail('GET', `/${resourceType}?<search>`, error);
    }
  }

  async operationEverything(patientId: string, opts: EverythingOptions = {}): Promise<Bundle> {
    const params: SearchParams = {};
    if (opts.count !== undefined) params._count = opts.count;
    if (opts.since) params._since = opts.since;
    if (opts.types && opts.types.length > 0) params._type = opts.types.join(',');
    const path = `/Patient/${patientId}/$everything`;
    try {
      const { data, status } = await this.http.get<Bundle>(path, { params });
      this.logger.log(`GET ${path} -> ${status}`);
      return data;
    } catch (error) {
      throw this.fail('GET', path, error);
    }
  }

  /** HAPI's CapabilityStatement — used as a connectivity probe. */
  async capabilityStatement(): Promise<CapabilityStatement> {
    try {
      const { data } = await this.http.get<CapabilityStatement>('/metadata');
      return data;
    } catch (error) {
      throw this.fail('GET', '/metadata', error);
    }
  }

  private fail(method: string, path: string, error: unknown): never {
    const mapped = mapFhirError(error);
    this.logger.warn(`${method} ${path} failed -> ${mapped.getStatus()}`);
    throw mapped;
  }
}
