import { NotFoundException } from '@nestjs/common';
import type { Bundle, Resource } from 'fhir/r4';

import type { SearchParams } from '../src/core/fhir';

/** Loosely-typed view of the resource fields the gateway searches/links on. */
type AnyResource = Resource & {
  id?: string;
  identifier?: Array<{ system?: string; value?: string }>;
  status?: string;
  subject?: { reference?: string };
  patient?: { reference?: string };
  for?: { reference?: string };
  beneficiary?: { reference?: string };
  focus?: { reference?: string };
  entity?: Array<{ what?: { reference?: string } }>;
  name?: Array<{ family?: string; given?: string[] }>;
};

/** JSON deep-clone — FHIR resources are plain JSON (ISO date strings, no Dates). */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * In-memory FhirService double for the e2e flows. Implements only the surface
 * the gateway actually exercises — create / conditionalCreate / read / update /
 * search / $everything — over a Map, with no HAPI and no network so the suite
 * stays deterministic and laptop-runnable (ARCH.md §1/§11).
 *
 * It honours FHIR conditional-create (`If-None-Exist` by identifier), which is
 * what offline-replay idempotency (§8) relies on: a replayed write carrying a
 * stable client-request-id matches the original instead of duplicating it.
 */
export class InMemoryFhir {
  private readonly store = new Map<string, AnyResource>();
  private readonly counters = new Map<string, number>();

  /** Drop all state between tests. */
  reset(): void {
    this.store.clear();
    this.counters.clear();
  }

  async create<T extends Resource>(resource: T): Promise<T> {
    return this.put(resource);
  }

  async conditionalCreate<T extends Resource>(
    resource: T,
    ifNoneExist: string,
  ): Promise<{ resource: T; created: boolean }> {
    const match = this.matchIfNoneExist(resource.resourceType, ifNoneExist);
    if (match) return { resource: clone(match) as unknown as T, created: false };
    return { resource: this.put(resource), created: true };
  }

  async read<T extends Resource>(resourceType: string, id: string): Promise<T> {
    const found = this.store.get(`${resourceType}/${id}`);
    if (!found) throw new NotFoundException(`${resourceType}/${id} not found`);
    return clone(found) as unknown as T;
  }

  async update<T extends Resource>(resource: T): Promise<T> {
    const r = resource as AnyResource;
    if (!r.id) throw new Error('InMemoryFhir.update requires resource.id');
    this.store.set(`${r.resourceType}/${r.id}`, clone(r));
    return clone(r) as unknown as T;
  }

  async patch<T extends Resource>(): Promise<T> {
    throw new Error('InMemoryFhir.patch is not implemented (unused by the e2e flows)');
  }

  async search<T extends Resource>(
    resourceType: string,
    params: SearchParams = {},
  ): Promise<Bundle<T>> {
    let results = this.ofType(resourceType);
    for (const [key, raw] of Object.entries(params)) {
      if (key.startsWith('_')) continue; // _count / _sort / _since / _type don't filter
      results = results.filter((r) => this.matchParam(r, key, String(raw)));
    }
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: results.length,
      entry: results.map((r) => ({ resource: clone(r) as unknown as T })),
    };
  }

  /** Patient/$everything — the patient plus every resource that references it. */
  async operationEverything(patientId: string): Promise<Bundle> {
    const ref = `Patient/${patientId}`;
    const linked = [...this.store.values()].filter((r) => {
      if (r.resourceType === 'Patient' && r.id === patientId) return true;
      return [
        r.subject?.reference,
        r.patient?.reference,
        r.for?.reference,
        r.beneficiary?.reference,
      ].includes(ref);
    });
    // Cast through unknown: AnyResource carries resourceType:string, which the
    // FhirResource union in @types/fhir rejects — fine for a test double.
    return {
      resourceType: 'Bundle',
      type: 'searchset',
      total: linked.length,
      entry: linked.map((r) => ({ resource: clone(r) })),
    } as unknown as Bundle;
  }

  async capabilityStatement(): Promise<Record<string, unknown>> {
    return { resourceType: 'CapabilityStatement', status: 'active' };
  }

  /* ----- internals ----- */

  private ofType(type: string): AnyResource[] {
    return [...this.store.values()].filter((r) => r.resourceType === type);
  }

  private nextId(type: string): string {
    const n = (this.counters.get(type) ?? 0) + 1;
    this.counters.set(type, n);
    return `${type.toLowerCase()}-${n}`;
  }

  private put<T extends Resource>(resource: T): T {
    const r = clone(resource) as AnyResource;
    if (!r.id) r.id = this.nextId(r.resourceType);
    this.store.set(`${r.resourceType}/${r.id}`, r);
    return clone(r) as unknown as T;
  }

  /** The gateway's conditional creates are always `identifier=<system>|<value>`. */
  private matchIfNoneExist(type: string, query: string): AnyResource | undefined {
    const eq = query.indexOf('=');
    if (eq < 0) return undefined;
    const key = query.slice(0, eq);
    const value = query.slice(eq + 1);
    if (key !== 'identifier') return undefined;
    return this.ofType(type).find((r) => this.matchParam(r, 'identifier', value));
  }

  private matchParam(resource: AnyResource, key: string, value: string): boolean {
    switch (key) {
      case 'identifier': {
        const [system, val] = value.includes('|') ? value.split('|') : [undefined, value];
        return (resource.identifier ?? []).some(
          (i) => (system === undefined || i.system === system) && i.value === val,
        );
      }
      case 'status':
        return value.split(',').includes(String(resource.status));
      case 'focus':
        return resource.focus?.reference === value;
      case 'subject':
        return resource.subject?.reference === value;
      case 'patient':
        return resource.patient?.reference === value;
      case 'entity':
        return (resource.entity ?? []).some((e) => e.what?.reference === value);
      case 'name':
        return (resource.name ?? []).some(
          (n) =>
            (n.family ?? '').toLowerCase().includes(value.toLowerCase()) ||
            (n.given ?? []).some((g) => g.toLowerCase().includes(value.toLowerCase())),
        );
      default:
        // Unknown params (e.g. date ranges) don't constrain the in-memory search.
        return true;
    }
  }
}
