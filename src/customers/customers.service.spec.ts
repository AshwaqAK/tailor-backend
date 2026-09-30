/// <reference types="jest" />

import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Connection, Model } from 'mongoose';

import { Gender } from './enums/gender.enum';
import type { CustomerCounterDocument } from './schemas/customer-counter.schema';
import type { CustomerDocument } from './schemas/customer.schema';
import { CustomersService } from './customers.service';

jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('CustomersService', () => {
  const objectId = '507f1f77bcf86cd799439011';
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');
  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    inTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let connection: { startSession: jest.Mock };
  let customerModel: jest.Mock & {
    findOne: jest.Mock;
    findById: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    findByIdAndUpdate: jest.Mock;
  };
  let counterModel: { findOneAndUpdate: jest.Mock };
  let service: CustomersService;

  const createCustomerDocument = (overrides: Partial<CustomerDocument> = {}) => {
    const save = jest.fn();
    const customer = {
      _id: { toString: () => objectId },
      customerId: 'CUS-000001',
      name: 'Customer One',
      phone: '+919876543210',
      alternatePhone: '+919123456789',
      email: 'customer@example.com',
      gender: Gender.FEMALE,
      isActive: true,
      createdBy: 'USR-000001',
      updatedBy: 'USR-000001',
      createdAt,
      updatedAt,
      save,
      ...overrides,
    } as unknown as CustomerDocument;
    save.mockResolvedValue(customer);

    return { customer, save };
  };

  beforeEach(() => {
    session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      inTransaction: jest.fn().mockReturnValue(false),
      endSession: jest.fn(),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };
    customerModel = Object.assign(jest.fn(), {
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    });
    counterModel = { findOneAndUpdate: jest.fn() };
    service = new CustomersService(
      connection as unknown as Connection,
      customerModel as unknown as Model<CustomerDocument>,
      counterModel as unknown as Model<CustomerCounterDocument>,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a customer with a generated ID and audit fields', async () => {
    customerModel.findOne.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    });
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 42 }),
    });
    const { customer, save } = createCustomerDocument({ customerId: 'CUS-000042' });
    customerModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(customer, data),
    );

    const result = await service.createCustomer(
      {
        name: 'Customer One',
        phone: '98765 43210',
        alternatePhone: '91234-56789',
        email: 'customer@example.com',
        gender: Gender.FEMALE,
      },
      'USR-000009',
    );

    expect(customerModel).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'CUS-000042',
        phone: '+919876543210',
        alternatePhone: '+919123456789',
        createdBy: 'USR-000009',
        updatedBy: 'USR-000009',
      }),
    );
    expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'customer' },
      { $inc: { sequence: 1 } },
      expect.objectContaining({ session }),
    );
    expect(save).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(result.customerId).toBe('CUS-000042');
  });

  it('rejects an active customer with the same normalized phone', async () => {
    customerModel.findOne.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue({ _id: objectId }) }),
    });

    await expect(
      service.createCustomer(
        { name: 'Duplicate', phone: '9876543210', gender: Gender.MALE },
        'USR-000001',
      ),
    ).rejects.toThrow(
      new ConflictException('An active customer with this phone number already exists'),
    );
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('rejects an invalid Indian phone number', async () => {
    await expect(
      service.createCustomer(
        { name: 'Invalid Phone', phone: '12345', gender: Gender.MALE },
        'USR-000001',
      ),
    ).rejects.toThrow(new ConflictException('Invalid Indian mobile phone number'));
    expect(customerModel.findOne).not.toHaveBeenCalled();
  });

  it('returns filtered and paginated customers', async () => {
    const { customer } = createCustomerDocument();
    const exec = jest.fn().mockResolvedValue([customer]);
    const limit = jest.fn().mockReturnValue({ exec });
    const skip = jest.fn().mockReturnValue({ limit });
    const sort = jest.fn().mockReturnValue({ skip });
    customerModel.find.mockReturnValue({ sort });
    customerModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(21),
    });

    const result = await service.searchCustomers({
      page: 2,
      limit: 10,
      search: 'CUS.000001',
      isActive: true,
      sortBy: 'name',
      sortOrder: 'asc',
    });

    expect(customerModel.find).toHaveBeenCalledWith({
      isActive: true,
      $or: [
        { name: { $regex: 'CUS.000001', $options: 'i' } },
        { phone: 'CUS.000001' },
        { customerId: { $regex: '^CUS\\.000001', $options: 'i' } },
      ],
    });
    expect(sort).toHaveBeenCalledWith({ name: 1 });
    expect(skip).toHaveBeenCalledWith(10);
    expect(limit).toHaveBeenCalledWith(10);
    expect(result.meta).toEqual({ page: 2, limit: 10, total: 21, totalPages: 3 });
    expect(result.data).toHaveLength(1);
  });

  it('finds a customer by database ID', async () => {
    const { customer } = createCustomerDocument();
    customerModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(customer) });

    await expect(service.findCustomerById(objectId)).resolves.toEqual(
      expect.objectContaining({ customerId: 'CUS-000001' }),
    );
  });

  it('throws when a customer is missing', async () => {
    customerModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.findCustomerById('missing-id')).rejects.toThrow(
      new NotFoundException('Customer not found'),
    );
  });

  it('updates mutable fields with the authenticated updater', async () => {
    const { customer } = createCustomerDocument({
      name: 'Updated Customer',
      phone: '+919999999999',
      updatedBy: 'USR-000010',
    });
    customerModel.findOne.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    });
    customerModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(customer),
    });

    await service.updateCustomer(
      objectId,
      { name: 'Updated Customer', phone: '9999999999' },
      'USR-000010',
    );

    expect(customerModel.findByIdAndUpdate).toHaveBeenCalledWith(
      objectId,
      { name: 'Updated Customer', phone: '+919999999999', updatedBy: 'USR-000010' },
      { new: true, runValidators: true },
    );
  });

  it('deactivates instead of deleting and records updatedBy', async () => {
    const { customer } = createCustomerDocument({ isActive: false });
    customerModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(customer),
    });

    const result = await service.deactivateCustomer(objectId, 'USR-000011');

    expect(customerModel.findByIdAndUpdate).toHaveBeenCalledWith(
      objectId,
      { isActive: false, updatedBy: 'USR-000011' },
      { new: true, runValidators: true },
    );
    expect(result.isActive).toBe(false);
  });
});
