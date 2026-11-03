import { describe, expect, it } from 'vitest';
import { ItService } from '../catalog/index.js';
import {
  DuplicateIncidentException,
  InvalidIncidentException,
  ServiceNotFoundException,
} from '../exceptions/index.js';
import { asItServiceId } from '../shared/index.js';
import { IncidentFactory, type IncidentDraft, type ReportContext } from './incident-factory.js';
import { at, duplicateId, reportProps, service } from './test-fixtures.js';

const draft: IncidentDraft = reportProps;
const context: ReportContext = {
  id: reportProps.id,
  number: reportProps.number,
  at,
  service,
  openIncidentsOfReporter: [],
};

describe('IncidentFactory', () => {
  it('factoryRejectsUnknownService', () => {
    expect(() => IncidentFactory.report(draft, { ...context, service: undefined })).toThrow(
      ServiceNotFoundException,
    );
  });
  it('factoryRejectsInactiveService', () => {
    const inactive = ItService.rehydrate({ ...service.toSnapshot(), active: false });
    expect(() => IncidentFactory.report(draft, { ...context, service: inactive })).toThrow(
      ServiceNotFoundException,
    );
  });
  it('factoryRejectsServiceContextForDifferentService', () => {
    const different = ItService.rehydrate({ ...service.toSnapshot(), id: asItServiceId('email') });
    expect(() => IncidentFactory.report(draft, { ...context, service: different })).toThrow(
      ServiceNotFoundException,
    );
  });
  it('factoryRejectsDuplicateOpenIncident', () => {
    expect(() =>
      IncidentFactory.report(draft, {
        ...context,
        openIncidentsOfReporter: [{ id: duplicateId, serviceId: service.id(), title: draft.title }],
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'DUPLICATE_INCIDENT',
        details: { existingIncidentId: duplicateId },
      }),
    );
  });
  it.each(['  WIFI IS UNAVAILABLE  ', 'WiFi\t IS   unavailable', 'wifi\nis unavailable'])(
    'factoryRejectsCaseAndWhitespaceEquivalentTitle %j',
    (title) => {
      expect(() =>
        IncidentFactory.report(draft, {
          ...context,
          openIncidentsOfReporter: [{ id: duplicateId, serviceId: service.id(), title }],
        }),
      ).toThrow(DuplicateIncidentException);
    },
  );
  it('factoryAllowsSameTitleForDifferentService', () => {
    const incident = IncidentFactory.report(draft, {
      ...context,
      openIncidentsOfReporter: [
        { id: duplicateId, serviceId: asItServiceId('email'), title: draft.title },
      ],
    });
    expect(incident.status()).toBe('NEW');
  });
  it('factoryAllowsDifferentTitleForSameService', () => {
    const incident = IncidentFactory.report(draft, {
      ...context,
      openIncidentsOfReporter: [
        { id: duplicateId, serviceId: service.id(), title: 'Different problem' },
      ],
    });
    expect(incident.status()).toBe('NEW');
  });
  it('factoryUsesContextIdentityNumberAndTime', () => {
    const incident = IncidentFactory.report(draft, context);
    expect(incident.toSnapshot()).toMatchObject({
      id: context.id,
      number: context.number.value,
      createdAt: context.at.toIso(),
      serviceId: service.id(),
    });
    expect(incident.pullEvents().map((event) => event.type)).toEqual(['IncidentCreated']);
  });
  it('factoryRejectsInvalidDraft', () => {
    expect(() => IncidentFactory.report({ ...draft, title: ' ' }, context)).toThrow(
      InvalidIncidentException,
    );
  });
  it('factoryDoesNotMutateCallerContext', () => {
    const before = JSON.stringify(context);
    IncidentFactory.report(draft, context);
    expect(JSON.stringify(context)).toBe(before);
  });
});
