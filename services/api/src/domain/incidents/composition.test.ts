import { describe, expect, it } from 'vitest';
import { InvalidIncidentException } from '../exceptions/index.js';
import { Rating } from '../shared/index.js';
import { ClosureInfo } from './closure-info.js';
import { Feedback } from './feedback.js';
import { InfoRequest } from './info-request.js';
import { InvestigationNote } from './investigation-note.js';
import { Resolution } from './resolution.js';
import { at, later, reporterId, technicianId } from './test-fixtures.js';

describe('Incident composition', () => {
  it('rejectsAnsweringAnAlreadyAnsweredRequest', () => {
    const request = new InfoRequest('Which office?', technicianId, at);
    expect(request.isOpen()).toBe(true);
    request.answer('Office A', later);
    expect(request.isOpen()).toBe(false);
    const before = request.toSnapshot();
    expect(() => request.answer('Office B', later)).toThrow(InvalidIncidentException);
    expect(request.toSnapshot()).toEqual(before);
  });
  it('invalidAnswerLeavesRequestOpen', () => {
    const request = new InfoRequest('Which office?', technicianId, at);
    const before = request.toSnapshot();
    expect(() => request.answer(' ', later)).toThrow(InvalidIncidentException);
    expect(request.toSnapshot()).toEqual(before);
    expect(request.isOpen()).toBe(true);
  });
  it.each([{ answer: 'Office A' }, { answeredAt: later.toIso() }])(
    'rejectsIncompleteAnswerSnapshot %j',
    (fields) => {
      expect(() =>
        InfoRequest.rehydrate({
          question: 'Which office?',
          askedBy: technicianId,
          askedAt: at.toIso(),
          ...fields,
        }),
      ).toThrow(InvalidIncidentException);
    },
  );
  it('infoRequestRoundTripPreservesAnsweredAndOpenRequests', () => {
    const request = new InfoRequest('Which office?', technicianId, at);
    expect(InfoRequest.rehydrate(request.toSnapshot()).toSnapshot()).toEqual(request.toSnapshot());
    request.answer('Office A', later);
    const restored = InfoRequest.rehydrate(request.toSnapshot());
    expect(restored.toSnapshot()).toEqual(request.toSnapshot());
    expect(restored.isOpen()).toBe(false);
    expect(() => restored.answer('Again', later)).toThrow(InvalidIncidentException);
  });
  it('infoRequestSnapshotCannotMutateTheRequest', () => {
    const request = new InfoRequest('Which office?', technicianId, at);
    Reflect.set(request.toSnapshot(), 'question', 'External edit');
    expect(request.question).toBe('Which office?');
  });
  it('compositionValuesAreImmutableAndPreserveMetadata', () => {
    const note = new InvestigationNote(technicianId, ' A note ', at);
    const resolution = new Resolution(' Fixed router ', 'Hardware fault', technicianId, later);
    const feedback = new Feedback(Rating.of(4), ' Thanks ', later);
    const closure = new ClosureInfo('RESOLVED', reporterId, later);
    for (const value of [note, resolution, feedback, closure])
      expect(Object.isFrozen(value)).toBe(true);
    expect(note).toMatchObject({ text: 'A note', authorId: technicianId, at });
    expect(resolution).toMatchObject({
      summary: 'Fixed router',
      rootCause: 'Hardware fault',
      resolvedBy: technicianId,
      at: later,
    });
    expect(feedback).toMatchObject({ rating: Rating.of(4), comment: 'Thanks', at: later });
    expect(closure).toMatchObject({ reason: 'RESOLVED', closedBy: reporterId, at: later });
  });
});
