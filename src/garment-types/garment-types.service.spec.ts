/// <reference types="jest" />

import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ClientSession, Connection, Model } from 'mongoose';

import { CreateGarmentTypeDto } from './dto/create-garment-type.dto';
import type { GarmentTypeDocument } from './garment-types.service';
import { GarmentTypesService } from './garment-types.service';

jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('GarmentTypesService', () => {
  let service: GarmentTypesService;
  let garmentTypeModel: jest.Mock & {
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let counterModel: { findOneAndUpdate: jest.Mock };
  let session: ClientSession;
  let document: GarmentTypeDocument & { save: jest.Mock };

  const dto = {
    name: 'Shirt',
    code: 'SHIRT',
    tailoringService: { serviceId: 'SRV-000001', basePrice: 750 },
    customizationGroups: [],
    measurementFields: [],
  } as CreateGarmentTypeDto;

  beforeEach(() => {
    session = {
      startTransaction: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(false),
      abortTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      endSession: jest.fn(),
    } as unknown as ClientSession;

    document = {
      save: jest.fn().mockResolvedValue(undefined),
    } as unknown as GarmentTypeDocument & { save: jest.Mock };

    garmentTypeModel = Object.assign(
      jest.fn().mockImplementation((value) => {
        Object.assign(document, value);
        return document;
      }),
      {
        find: jest.fn(),
        findOne: jest.fn(),
      },
    );

    counterModel = { findOneAndUpdate: jest.fn() };

    service = new GarmentTypesService(
      { startSession: jest.fn().mockResolvedValue(session) } as unknown as Connection,
      garmentTypeModel as unknown as Model<GarmentTypeDocument>,
      counterModel as never,
    );
  });

  it('creates a garment type with a generated ID and embedded configuration', async () => {
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 12 }),
    });

    await service.create(dto, 'USR-000001');

    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'garmentType' },
      { $inc: { sequence: 1 } },
      expect.objectContaining({ session, new: true, upsert: true }),
    );
    expect(document.garmentTypeId).toBe('GRT-000012');
    expect(document.customizationGroups).toBe(dto.customizationGroups);
    expect(document.measurementFields).toBe(dto.measurementFields);
    expect(document.save.mock.calls).toContainEqual([{ session }]);
  });

  it('gets all garment types', async () => {
    const list = [document];
    const exec = jest.fn().mockResolvedValue(list);
    const sort = jest.fn().mockReturnValue({ exec });
    garmentTypeModel.find.mockReturnValue({ sort });

    await expect(service.findAll()).resolves.toBe(list);
  });

  it('gets a garment type by garmentTypeId', async () => {
    garmentTypeModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(document) });

    await expect(service.findOne('GRT-000001')).resolves.toBe(document);
    expect(garmentTypeModel.findOne).toHaveBeenCalledWith({ garmentTypeId: 'GRT-000001' });
  });

  it('throws when a garment type is missing', async () => {
    garmentTypeModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.findOne('GRT-999999')).rejects.toEqual(
      new NotFoundException('Garment type not found'),
    );
  });

  it('updates the garment type and preserves nested configuration', async () => {
    document.garmentTypeId = 'GRT-000001';
    document.customizationGroups = dto.customizationGroups;
    garmentTypeModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(document) });
    const update = { name: 'Formal Shirt' };

    await service.update('GRT-000001', update, 'USR-000002');

    expect(document.name).toBe('Formal Shirt');
    expect(document.customizationGroups).toBe(dto.customizationGroups);
    expect(document.updatedBy).toBe('USR-000002');
    expect(document.save.mock.calls.length).toBeGreaterThan(0);
  });

  it('maps duplicate name/code errors to a conflict', async () => {
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 1 }),
    });
    document.save.mockRejectedValue({ code: 11000, keyPattern: { name: 1 } });

    await expect(service.create(dto, 'USR-000001')).rejects.toEqual(
      new ConflictException('Garment type name already exists'),
    );
  });
});
