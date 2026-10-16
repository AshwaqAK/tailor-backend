/// <reference types="jest" />

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Connection, Model } from 'mongoose';

import type { CustomerDocument } from '../customers/schemas/customer.schema';
import type { OrderItemDocument } from '../orders/schemas/order-item.schema';
import type { OrderDocument } from '../orders/schemas/order.schema';
import type { CounterDocument } from '../users/schemas/counter.schema';
import { AlterationQueryDto } from './dto/alteration-query.dto';
import { CreateAlterationDto } from './dto/create-alteration.dto';
import { UpdateAlterationDto } from './dto/update-alteration.dto';
import { AlterationStatus } from './enums/alteration-status.enum';
import type { AlterationDocument } from './schemas/alteration.schema';
import { AlterationsService } from './alterations.service';

jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('AlterationsService', () => {
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    inTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let alterationModel: jest.Mock & {
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let customerModel: { exists: jest.Mock };
  let orderModel: jest.Mock & { findOne: jest.Mock };
  let orderItemModel: { findOne: jest.Mock };
  let counterModel: { findOneAndUpdate: jest.Mock };
  let service: AlterationsService;

  const validDto = (): CreateAlterationDto => ({
    customerId: 'CUS-000001',
    originalOrderId: 'ORD-000001',
    originalOrderItemId: '507f1f77bcf86cd799439011',
    description: 'Shorten sleeves',
    notes: 'Preserve cuffs',
    charge: 125,
  });

  const queryWithSession = (result: unknown) => {
    const exec = jest.fn().mockResolvedValue(result);
    const sessionMethod = jest.fn().mockReturnValue({ exec });
    return { exec, sessionMethod };
  };

  const mockValidReferences = () => {
    const customer = queryWithSession({ _id: 'customer-id' });
    customerModel.exists.mockReturnValue({ session: customer.sessionMethod, exec: customer.exec });

    const orderExec = jest.fn().mockResolvedValue({ customerId: 'CUS-000001' });
    const orderSession = jest.fn().mockReturnValue({ exec: orderExec });
    const orderSelect = jest.fn().mockReturnValue({ session: orderSession, exec: orderExec });
    orderModel.findOne.mockReturnValue({ select: orderSelect });

    const itemExec = jest.fn().mockResolvedValue({ _id: 'item-id' });
    const itemSession = jest.fn().mockReturnValue({ exec: itemExec });
    const itemSelect = jest.fn().mockReturnValue({ session: itemSession, exec: itemExec });
    orderItemModel.findOne.mockReturnValue({ select: itemSelect });
  };

  const makeAlteration = (overrides: Partial<AlterationDocument> = {}) => {
    const save = jest.fn();
    const alteration = {
      alterationId: 'ALT-000007',
      customerId: 'CUS-000001',
      originalOrderId: 'ORD-000001',
      originalOrderItemId: '507f1f77bcf86cd799439011',
      description: 'Shorten sleeves',
      status: AlterationStatus.REQUESTED,
      charge: 0,
      createdBy: 'USR-000001',
      updatedBy: 'USR-000001',
      save,
      ...overrides,
    } as unknown as AlterationDocument;
    save.mockResolvedValue(alteration);
    return { alteration, save };
  };

  beforeEach(() => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(true),
      endSession: jest.fn(),
    };
    alterationModel = Object.assign(jest.fn(), {
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    });
    customerModel = { exists: jest.fn() };
    orderModel = Object.assign(jest.fn(), { findOne: jest.fn() });
    orderItemModel = { findOne: jest.fn() };
    counterModel = { findOneAndUpdate: jest.fn() };
    service = new AlterationsService(
      { startSession: jest.fn().mockResolvedValue(session) } as unknown as Connection,
      alterationModel as unknown as Model<AlterationDocument>,
      customerModel as unknown as Model<CustomerDocument>,
      orderModel as unknown as Model<OrderDocument>,
      orderItemModel as unknown as Model<OrderItemDocument>,
      counterModel as unknown as Model<CounterDocument>,
    );
  });

  it('creates a validated alteration with generated ID and authenticated audit fields', async () => {
    mockValidReferences();
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 7 }),
    });
    const { alteration, save } = makeAlteration();
    alterationModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(alteration, data),
    );

    const result = await service.create(validDto(), 'USR-000009');

    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'alteration' },
      { $inc: { sequence: 1 } },
      expect.objectContaining({ session, upsert: true, new: true }),
    );
    expect(alterationModel).toHaveBeenCalledWith(
      expect.objectContaining({
        alterationId: 'ALT-000007',
        createdBy: 'USR-000009',
        updatedBy: 'USR-000009',
      }),
    );
    expect(save).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(result.alterationId).toBe('ALT-000007');
  });

  it('rejects missing customer, mismatched order, and mismatched order item', async () => {
    const customer = queryWithSession(null);
    customerModel.exists.mockReturnValue({ session: customer.sessionMethod, exec: customer.exec });
    await expect(service.create(validDto(), 'USR-000001')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    mockValidReferences();
    const mismatchOrderExec = jest.fn().mockResolvedValue({ customerId: 'CUS-000002' });
    orderModel.findOne.mockReturnValue({
      select: jest
        .fn()
        .mockReturnValue({ session: jest.fn().mockReturnValue({ exec: mismatchOrderExec }) }),
    });
    await expect(service.create(validDto(), 'USR-000001')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    mockValidReferences();
    const missingItemExec = jest.fn().mockResolvedValue(null);
    orderItemModel.findOne.mockReturnValue({
      select: jest
        .fn()
        .mockReturnValue({ session: jest.fn().mockReturnValue({ exec: missingItemExec }) }),
    });
    await expect(service.create(validDto(), 'USR-000001')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(alterationModel).not.toHaveBeenCalled();
  });

  it('lists with filters and retrieves by alteration ID', async () => {
    const findQuery = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([{ alterationId: 'ALT-000001' }]),
    };
    alterationModel.find.mockReturnValue(findQuery);
    alterationModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });
    const query = Object.assign(new AlterationQueryDto(), {
      page: 2,
      limit: 5,
      customerId: 'CUS-000001',
      orderId: 'ORD-000001',
      status: AlterationStatus.IN_PROGRESS,
    });

    await expect(service.findAll(query)).resolves.toMatchObject({
      meta: { page: 2, limit: 5, total: 1 },
    });
    expect(alterationModel.find).toHaveBeenCalledWith({
      customerId: 'CUS-000001',
      originalOrderId: 'ORD-000001',
      status: AlterationStatus.IN_PROGRESS,
    });

    const { alteration } = makeAlteration();
    alterationModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(alteration) });
    await expect(service.findOne('ALT-000007')).resolves.toBe(alteration);
  });

  it('enforces transitions and sets completion metadata in the service', async () => {
    const { alteration, save } = makeAlteration({ status: AlterationStatus.IN_PROGRESS });
    alterationModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(alteration) });
    await service.update(
      'ALT-000007',
      { status: AlterationStatus.COMPLETED, notes: 'Ready' },
      'USR-000009',
    );

    expect(alteration.completionDate).toEqual(expect.any(Date));
    expect(alteration.updatedBy).toBe('USR-000009');
    expect(save).toHaveBeenCalled();

    const completed = makeAlteration({ status: AlterationStatus.COMPLETED }).alteration;
    alterationModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(completed) });
    await expect(
      service.update('ALT-000007', { status: AlterationStatus.IN_PROGRESS }, 'USR-000009'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only reads order references and does not write order or order-item data', async () => {
    mockValidReferences();
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 8 }),
    });
    const { alteration } = makeAlteration();
    alterationModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(alteration, data),
    );

    await service.create(validDto(), 'USR-000001');

    expect(orderModel.findOne).toHaveBeenCalled();
    expect(orderItemModel.findOne).toHaveBeenCalled();
    expect((orderModel as unknown as { save?: jest.Mock }).save).toBeUndefined();
    expect((orderItemModel as unknown as { save?: jest.Mock }).save).toBeUndefined();
  });

  it('creates a confirmed alteration bill with an independent balance', async () => {
    const originalOrder = {
      customerId: 'CUS-000001',
      totalAmount: 1000,
      paidAmount: 1000,
      balanceAmount: 0,
    };
    const alteration = makeAlteration({
      status: AlterationStatus.COMPLETED,
      charge: 125,
      originalOrderId: 'ORD-000001',
    }).alteration;
    const alterationSession = jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(alteration) });
    alterationModel.findOne.mockReturnValue({ session: alterationSession });
    customerModel.exists.mockReturnValue({
      session: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: 'customer-id' }) }),
    });
    const orderExec = jest.fn().mockResolvedValue(originalOrder);
    orderModel.findOne.mockReturnValue({
      select: jest
        .fn()
        .mockReturnValue({ session: jest.fn().mockReturnValue({ exec: orderExec }) }),
    });
    orderItemModel.findOne.mockReturnValue({
      select: jest
        .fn()
        .mockReturnValue({
          session: jest
            .fn()
            .mockReturnValue({ exec: jest.fn().mockResolvedValue({ _id: 'item-id' }) }),
        }),
    });
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 9 }),
    });
    const billSave = jest.fn().mockResolvedValue(undefined);
    orderModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(data, { save: billSave }),
    );
    alterationModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ ...alteration, billingOrderId: 'ORD-000009' }),
    });

    const bill = await service.createBill('ALT-000007', 'USR-000009');

    expect(orderModel).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'ORD-000009',
        orderType: 'ALTERATION',
        customerId: 'CUS-000001',
        originalOrderId: 'ORD-000001',
        sourceAlterationId: 'ALT-000007',
        orderDate: expect.any(Date),
        status: 'CONFIRMED',
        totalAmount: 125,
        paidAmount: 0,
        balanceAmount: 125,
        createdBy: 'USR-000009',
        updatedBy: 'USR-000009',
      }),
    );
    expect(billSave).toHaveBeenCalledWith({ session });
    expect(alterationModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        alterationId: 'ALT-000007',
        status: AlterationStatus.COMPLETED,
        billingOrderId: { $exists: false },
      },
      { $set: { billingOrderId: 'ORD-000009', updatedBy: 'USR-000009' } },
      { new: true, session },
    );
    expect(originalOrder).toMatchObject({ totalAmount: 1000, paidAmount: 1000, balanceAmount: 0 });
    expect(bill).toMatchObject({
      orderType: 'ALTERATION',
      status: 'CONFIRMED',
      balanceAmount: 125,
    });
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it.each([
    [
      'unsupported status',
      { status: AlterationStatus.IN_PROGRESS, charge: 125 },
      BadRequestException,
    ],
    ['zero charge', { status: AlterationStatus.COMPLETED, charge: 0 }, BadRequestException],
    ['negative charge', { status: AlterationStatus.COMPLETED, charge: -1 }, BadRequestException],
  ])('rejects %s before bill creation', async (_name, overrides, exception) => {
    const alteration = makeAlteration(overrides).alteration;
    alterationModel.findOne.mockReturnValue({
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(alteration) }),
    });

    await expect(service.createBill('ALT-000007', 'USR-000001')).rejects.toBeInstanceOf(exception);
    expect(orderModel).not.toHaveBeenCalled();
    expect(counterModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it('rejects an existing bill and a concurrent billing state change', async () => {
    const billed = makeAlteration({
      status: AlterationStatus.COMPLETED,
      charge: 125,
      billingOrderId: 'ORD-000008',
    }).alteration;
    alterationModel.findOne.mockReturnValue({
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(billed) }),
    });
    await expect(service.createBill('ALT-000007', 'USR-000001')).rejects.toBeInstanceOf(
      ConflictException,
    );

    const unbilled = makeAlteration({ status: AlterationStatus.COMPLETED, charge: 125 }).alteration;
    alterationModel.findOne.mockReturnValue({
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(unbilled) }),
    });
    mockValidReferences();
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 10 }),
    });
    orderModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(data, { save: jest.fn() }),
    );
    alterationModel.findOneAndUpdate.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.createBill('ALT-000007', 'USR-000001')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it('rolls back when bill persistence fails and prevents charge edits after billing', async () => {
    const alteration = makeAlteration({
      status: AlterationStatus.COMPLETED,
      charge: 125,
    }).alteration;
    alterationModel.findOne.mockReturnValue({
      session: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(alteration) }),
    });
    mockValidReferences();
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 11 }),
    });
    orderModel.mockImplementation(() => ({
      save: jest.fn().mockRejectedValue(new Error('write failed')),
    }));

    await expect(service.createBill('ALT-000007', 'USR-000001')).rejects.toThrow(
      'Unable to create alteration bill',
    );
    expect(alterationModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();

    const billed = makeAlteration({ billingOrderId: 'ORD-000011' }).alteration;
    alterationModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(billed) });
    await expect(
      service.update('ALT-000007', { charge: 200 }, 'USR-000001'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
