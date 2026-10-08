/// <reference types="jest" />

import { Role } from '../common/constants/role.enum';
import type { CreateGarmentTypeDto } from './dto/create-garment-type.dto';
import type { UpdateGarmentTypeDto } from './dto/update-garment-type.dto';
import type { GarmentTypesService } from './garment-types.service';
import { GarmentTypesController } from './garment-types.controller';

jest.mock('../auth/auth-token.service', () => ({
  AuthTokenService: class AuthTokenService {},
}));
jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('GarmentTypesController', () => {
  const user = {
    sub: 'database-user-id',
    userId: 'USR-000001',
    role: Role.MANAGER,
  };

  it('delegates create, list, find-one, and update operations', async () => {
    const create = jest.fn();
    const findAll = jest.fn();
    const findOne = jest.fn();
    const update = jest.fn();
    const service = {
      create,
      findAll,
      findOne,
      update,
    } as unknown as GarmentTypesService;
    const controller = new GarmentTypesController(service);
    const createDto = {
      name: 'Shirt',
      code: 'SHIRT',
      tailoringService: { serviceId: 'SRV-000001', basePrice: 750 },
      customizationGroups: [],
      measurementFields: [],
    } as CreateGarmentTypeDto;
    const updateDto: UpdateGarmentTypeDto = { name: 'Formal Shirt' };

    await controller.create(createDto, user);
    await controller.findAll();
    await controller.findOne('GRT-000001');
    await controller.update('GRT-000001', updateDto, user);

    expect(create).toHaveBeenCalledWith(createDto, 'USR-000001');
    expect(findAll).toHaveBeenCalledWith();
    expect(findOne).toHaveBeenCalledWith('GRT-000001');
    expect(update).toHaveBeenCalledWith('GRT-000001', updateDto, 'USR-000001');
  });
});
