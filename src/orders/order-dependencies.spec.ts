/// <reference types="jest" />

import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ClientSession, Connection, Model } from 'mongoose';

import { FabricsService } from '../fabrics/fabrics.service';
import type { FabricDocument } from '../fabrics/schemas/fabric.schema';
import { ServicesService } from '../services/services.service';
import type { TailoringServiceDocument } from '../services/schemas/tailoring-service.schema';
import type { CounterDocument } from '../users/schemas/counter.schema';

jest.mock('@nestjs/mongoose', () => ({
  InjectConnection: () => () => undefined,
  InjectModel: () => () => undefined,
  Prop: () => () => undefined,
  Schema: () => (target: unknown) => target,
  SchemaFactory: { createForClass: () => ({ index: jest.fn() }) },
}));

describe('Order dependency validation', () => {
  const session = {} as ClientSession;

  it('rejects inactive tailoring services', async () => {
    const query = {
      session: jest.fn(),
      exec: jest.fn().mockResolvedValue([{ serviceId: 'SRV-000001', isActive: false }]),
    };
    query.session.mockReturnValue(query);
    const serviceModel = { find: jest.fn().mockReturnValue(query) };
    const services = new ServicesService(
      {} as Connection,
      serviceModel as unknown as Model<TailoringServiceDocument>,
      {} as Model<CounterDocument>,
    );

    await expect(services.findActiveByIds(['SRV-000001'], session)).rejects.toThrow(
      new BadRequestException('Tailoring service SRV-000001 is inactive'),
    );
  });

  it('rejects missing tailoring-service references', async () => {
    const query = {
      session: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    query.session.mockReturnValue(query);
    const services = new ServicesService(
      {} as Connection,
      { find: jest.fn().mockReturnValue(query) } as unknown as Model<TailoringServiceDocument>,
      {} as Model<CounterDocument>,
    );

    await expect(services.findActiveByIds(['SRV-999999'], session)).rejects.toThrow(
      new NotFoundException('Tailoring service SRV-999999 not found'),
    );
  });

  it('uses one atomic query to deduct active fabric stock', async () => {
    const fabric = { fabricId: 'FAB-000001', quantity: 8 } as FabricDocument;
    const exec = jest.fn().mockResolvedValue(fabric);
    const fabricModel = {
      findOneAndUpdate: jest.fn().mockReturnValue({ exec }),
    };
    const fabrics = new FabricsService(
      {} as Connection,
      fabricModel as unknown as Model<FabricDocument>,
      {} as Model<CounterDocument>,
    );

    await expect(
      fabrics.deductStock('FAB-000001', 2, 'ORD-000001', 'USR-000001', session),
    ).resolves.toBe(fabric);
    expect(fabricModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        fabricId: 'FAB-000001',
        isActive: true,
        quantity: { $gte: 2 },
        stockDeductedOrderIds: { $ne: 'ORD-000001' },
      },
      {
        $inc: { quantity: -2 },
        $addToSet: { stockDeductedOrderIds: 'ORD-000001' },
        $set: { updatedBy: 'USR-000001' },
      },
      { new: true, runValidators: true, session },
    );
  });

  it('rejects inactive fabric references after the atomic deduction misses', async () => {
    const fallbackQuery = {
      select: jest.fn(),
      session: jest.fn(),
      exec: jest.fn().mockResolvedValue({
        fabricId: 'FAB-000001',
        isActive: false,
        stockDeductedOrderIds: [],
      }),
    };
    fallbackQuery.select.mockReturnValue(fallbackQuery);
    fallbackQuery.session.mockReturnValue(fallbackQuery);
    const fabricModel = {
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
      findOne: jest.fn().mockReturnValue(fallbackQuery),
    };
    const fabrics = new FabricsService(
      {} as Connection,
      fabricModel as unknown as Model<FabricDocument>,
      {} as Model<CounterDocument>,
    );

    await expect(
      fabrics.deductStock('FAB-000001', 2, 'ORD-000001', 'USR-000001', session),
    ).rejects.toThrow(new BadRequestException('Fabric FAB-000001 is inactive'));
  });
});
