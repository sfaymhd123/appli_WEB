import { ObservationHelper, PatientHelper } from './index';

describe('resource helpers', () => {
  it('build() stamps the resourceType and merges init fields', () => {
    const patient = PatientHelper.build({ active: true, name: [{ family: 'Test' }] });
    expect(patient.resourceType).toBe('Patient');
    expect(patient.active).toBe(true);
    expect(patient.name?.[0]?.family).toBe('Test');
  });

  it('build() with no init yields a minimal resource', () => {
    expect(ObservationHelper.build()).toEqual({ resourceType: 'Observation' });
  });

  it('is() narrows by resourceType and rejects other shapes', () => {
    expect(PatientHelper.is({ resourceType: 'Patient', id: '1' })).toBe(true);
    expect(PatientHelper.is({ resourceType: 'Observation' })).toBe(false);
    expect(PatientHelper.is(null)).toBe(false);
    expect(PatientHelper.is('Patient')).toBe(false);
  });
});
