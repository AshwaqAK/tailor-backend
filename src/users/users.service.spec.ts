/// <reference types="jest" />

import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Connection, Model } from 'mongoose';

import { Role } from '../common/constants/role.enum';
import type { CounterDocument } from './schemas/counter.schema';
import type { UserDocument } from './schemas/user.schema';
import { UsersService } from './users.service';

jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({}) },
}));
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('UsersService', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-02T00:00:00.000Z');
  const objectId = '507f1f77bcf86cd799439011';

  let session: {
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    abortTransaction: jest.Mock;
    inTransaction: jest.Mock;
    endSession: jest.Mock;
  };
  let connection: { startSession: jest.Mock };
  let userModel: jest.Mock & {
    findOne: jest.Mock;
    findById: jest.Mock;
    find: jest.Mock;
    updateOne: jest.Mock;
  };
  let counterModel: { findOneAndUpdate: jest.Mock };
  let service: UsersService;

  const createUserDocument = (overrides: Partial<UserDocument> = {}) => {
    const save = jest.fn();
    const user = {
      _id: { toString: () => objectId },
      userId: 'USR-000001',
      name: 'Test Manager',
      email: 'manager@example.com',
      phone: '+919876543210',
      passwordHash: 'stored-password-hash',
      role: Role.MANAGER,
      isActive: true,
      refreshTokenHash: 'stored-refresh-hash',
      lastLoginAt: null,
      createdAt,
      updatedAt,
      save,
      ...overrides,
    } as unknown as UserDocument;
    save.mockResolvedValue(user);

    return { user, save };
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
    userModel = Object.assign(jest.fn(), {
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
      updateOne: jest.fn(),
    });
    counterModel = { findOneAndUpdate: jest.fn() };
    service = new UsersService(
      connection as unknown as Connection,
      userModel as unknown as Model<UserDocument>,
      counterModel as unknown as Model<CounterDocument>,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('creates a user with a normalized email and hashed password', async () => {
    userModel.findOne.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(null) }),
    });
    jest.mocked(bcrypt.hash).mockResolvedValue('new-password-hash' as never);
    counterModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ sequence: 1 }),
    });
    const { user: document, save } = createUserDocument();
    userModel.mockImplementation((data: Record<string, unknown>) =>
      Object.assign(document, data),
    );

    const result = await service.create({
      name: 'Test Manager',
      email: 'MANAGER@EXAMPLE.COM',
      phone: '+919876543210',
      password: 'Password1!',
      role: Role.MANAGER,
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('Password1!', 12);
    expect(userModel).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'USR-000001',
        email: 'manager@example.com',
        passwordHash: 'new-password-hash',
        isActive: true,
      }),
    );
    expect(save).toHaveBeenCalledWith({ session });
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('refreshTokenHash');
  });

  it('rejects a duplicate email before hashing or starting a transaction', async () => {
    userModel.findOne.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue({ _id: objectId }) }),
    });

    await expect(
      service.create({
        name: 'Duplicate User',
        email: 'DUPLICATE@EXAMPLE.COM',
        password: 'Password1!',
        role: Role.RECEPTIONIST,
      }),
    ).rejects.toThrow(new ConflictException('Email already exists'));
    expect(userModel.findOne).toHaveBeenCalledWith({ email: 'duplicate@example.com' });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('finds a user by id', async () => {
    const { user } = createUserDocument();
    userModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(user) });

    await expect(service.findById(objectId)).resolves.toBe(user);
    expect(userModel.findById).toHaveBeenCalledWith(objectId);
  });

  it('throws the standard not-found exception for a missing user', async () => {
    userModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

    await expect(service.findById('missing-id')).rejects.toThrow(
      new NotFoundException('User not found'),
    );
  });

  it('normalizes email lookups', async () => {
    const { user } = createUserDocument();
    const exec = jest.fn().mockResolvedValue(user);
    userModel.findOne.mockReturnValue({ exec });

    await expect(service.findByEmail('MANAGER@EXAMPLE.COM')).resolves.toBe(user);
    expect(userModel.findOne).toHaveBeenCalledWith({ email: 'manager@example.com' });
  });

  it('never includes password or refresh-token hashes in user responses', () => {
    const { user } = createUserDocument();
    const response = service.toUserResponse(user);

    expect(response).toEqual({
      id: objectId,
      userId: 'USR-000001',
      name: 'Test Manager',
      email: 'manager@example.com',
      phone: '+919876543210',
      role: Role.MANAGER,
      isActive: true,
      lastLoginAt: null,
      createdAt,
      updatedAt,
    });
    expect(response).not.toHaveProperty('passwordHash');
    expect(response).not.toHaveProperty('refreshTokenHash');
  });

  it('updates user fields and invalidates refresh tokens when deactivated', async () => {
    const { user, save } = createUserDocument();
    jest.spyOn(service, 'findById').mockResolvedValue(user);

    const result = await service.update(objectId, {
      name: 'Inactive Manager',
      role: Role.TAILOR,
      isActive: false,
    });

    expect(user.name).toBe('Inactive Manager');
    expect(user.role).toBe(Role.TAILOR);
    expect(user.isActive).toBe(false);
    expect(user.refreshTokenHash).toBeNull();
    expect(save).toHaveBeenCalled();
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('hashes updated passwords and invalidates existing refresh tokens', async () => {
    const { user, save } = createUserDocument();
    jest.spyOn(service, 'findById').mockResolvedValue(user);
    jest.mocked(bcrypt.hash).mockResolvedValue('updated-password-hash' as never);

    await service.update(objectId, { password: 'UpdatedPassword1!' });

    expect(bcrypt.hash).toHaveBeenCalledWith('UpdatedPassword1!', 12);
    expect(user.passwordHash).toBe('updated-password-hash');
    expect(user.refreshTokenHash).toBeNull();
    expect(save).toHaveBeenCalled();
  });
});
