import {
  mapCorrespondenceRowToDraftForm,
  buildCorrespondenceRowForWrite,
  ICorrespondenceDraftRow,
} from '../mapCorrespondenceRow';
import { ICreateCorrespondencePayload } from '../../../models/ICorrespondencePayload';

describe('mapCorrespondenceRowToDraftForm', () => {
  it('round-trips a draft written by buildCorrespondenceRowForWrite', () => {
    const payload: ICreateCorrespondencePayload = {
      subject: 'Budget request',
      direction: 'Outgoing',
      priority: 'High',
      contentType: 'Letter',
      channel: 'Email',
      originatingFunction: 'Legal Affairs',
      securityTier: 4, // Secret
      recordClassification: '9974 - Finance',
      destinationType: 'Internal',
      destinationDepartments: ['Finance', 'Legal'],
      externalOrganizations: [],
      sender: 'ignored (people field)',
      recipient: 'Alice; Bob',
      dueDate: '2026-09-15',
      deliveryEmail: true,
      deliveryPhysicalMail: false,
      comments: 'Please review',
      mainDocumentSigned: true,
    };
    const written = buildCorrespondenceRowForWrite(
      payload,
      'Draft',
      7,
      7,
      undefined,
      '2026-08-31T09:00:00.000Z'
    );
    // Reading it back adds Id + expanded Sender/Title the write side doesn't carry.
    const row = { Id: 42, ...written, Sender: { Title: 'Creator' } } as unknown as ICorrespondenceDraftRow;

    expect(mapCorrespondenceRowToDraftForm(row)).toEqual({
      existingId: '42',
      subject: 'Budget request',
      direction: 'Outgoing',
      priority: 'High',
      contentType: 'Letter',
      channel: 'Email',
      originatingFunction: 'Legal Affairs',
      securityTier: 4,
      recordClassification: '9974 - Finance',
      destinationType: 'Internal',
      destinationDepartments: ['Finance', 'Legal'],
      externalOrganizations: [],
      sender: 'Creator',
      recipients: ['Alice', 'Bob'],
      dateCreated: '2026-08-31',
      dueDate: '2026-09-15',
      deliveryEmail: true,
      deliveryPhysicalMail: false,
      comments: 'Please review',
      mainDocumentSigned: true,
    });
  });

  it('leaves securityTier undefined when no level was chosen (blank SecurityLevel)', () => {
    const row = {
      Id: 1,
      Title: 'Draft with no security',
      Direction: 'Incoming',
      SecurityLevel: '',
      DestinationDepartments: '[]',
      ExternalOrganizations: '[]',
      Recipient: '',
    } as unknown as ICorrespondenceDraftRow;
    const result = mapCorrespondenceRowToDraftForm(row);
    expect(result.securityTier).toBeUndefined();
    expect(result.direction).toBe('Incoming');
    expect(result.destinationDepartments).toEqual([]);
    expect(result.recipients).toEqual([]);
  });

  it('tolerates a legacy semicolon-delimited department value', () => {
    const row = {
      Id: 2,
      DestinationDepartments: 'Finance; Legal',
      ExternalOrganizations: '',
      Recipient: 'Solo',
    } as unknown as ICorrespondenceDraftRow;
    const result = mapCorrespondenceRowToDraftForm(row);
    expect(result.destinationDepartments).toEqual(['Finance', 'Legal']);
    expect(result.recipients).toEqual(['Solo']);
  });
});
