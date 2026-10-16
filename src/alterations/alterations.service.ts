import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';

import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Counter, CounterDocument } from '../users/schemas/counter.schema';
import { CreateAlterationDto } from './dto/create-alteration.dto';
import { AlterationQueryDto } from './dto/alteration-query.dto';
import { UpdateAlterationDto } from './dto/update-alteration.dto';
import { AlterationStatus } from './enums/alteration-status.enum';
import { Alteration, AlterationDocument } from './schemas/alteration.schema';
import { OrderItem, OrderItemDocument } from '../orders/schemas/order-item.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { OrderStatus } from '../orders/enums/order-status.enum';
import { OrderType } from '../orders/enums/order-type.enum';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { AuditEntityType } from '../audit-logs/enums/audit-entity-type.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

export interface PaginatedAlterations {
  data: AlterationDocument[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class AlterationsService {
  private readonly allowedStatusTransitions: Record<AlterationStatus, readonly AlterationStatus[]> =
    {
      [AlterationStatus.REQUESTED]: [AlterationStatus.IN_PROGRESS, AlterationStatus.CANCELLED],
      [AlterationStatus.IN_PROGRESS]: [AlterationStatus.COMPLETED, AlterationStatus.CANCELLED],
      [AlterationStatus.COMPLETED]: [],
      [AlterationStatus.CANCELLED]: [],
    };

  constructor(
    @InjectConnection()
    private readonly connection: Connection,

    @InjectModel(Alteration.name)
    private readonly alterationModel: Model<AlterationDocument>,

    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,

    @InjectModel(OrderItem.name)
    private readonly orderItemModel: Model<OrderItemDocument>,

    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,

    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(dto: CreateAlterationDto, userId: string): Promise<AlterationDocument> {
    let session: ClientSession | undefined;

    try {
      session = await this.connection.startSession();
      session.startTransaction();

      await this.validateReferences(dto, session);

      const alteration = new this.alterationModel({
        alterationId: await this.generateAlterationId(session),
        customerId: dto.customerId,
        originalOrderId: dto.originalOrderId,
        originalOrderItemId: new Types.ObjectId(dto.originalOrderItemId),
        description: dto.description,
        notes: dto.notes,
        ...(dto.charge === undefined ? {} : { charge: dto.charge }),
        createdBy: userId,
        updatedBy: userId,
      });

      await alteration.save({ session });
      await this.auditLogsService.record(
        {
          actorId: userId,
          action: AuditAction.CREATED,
          entityType: AuditEntityType.ALTERATION,
          entityId: alteration.alterationId,
          metadata: {
            changedFields: ['customerId', 'originalOrderId', 'originalOrderItemId', 'description', 'notes', 'charge'],
          },
        },
        session,
      );
      await session.commitTransaction();

      return alteration;
    } catch (error) {
      if (session?.inTransaction()) {
        await session.abortTransaction();
      }

      return this.rethrowServiceError(error, 'create');
    } finally {
      await session?.endSession();
    }
  }

  async findAll(query: AlterationQueryDto): Promise<PaginatedAlterations> {
    const {
      page = 1,
      limit = 20,
      customerId,
      orderId,
      status,
      sortBy = 'requestDate',
      sortOrder = 'desc',
    } = query;
    const filter: Record<string, unknown> = {};

    if (customerId) filter.customerId = customerId;
    if (orderId) filter.originalOrderId = orderId;
    if (status) filter.status = status;

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    try {
      const [alterations, total] = await Promise.all([
        this.alterationModel
          .find(filter)
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.alterationModel.countDocuments(filter).exec(),
      ]);

      return {
        data: alterations,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } catch (error) {
      this.rethrowServiceError(error, 'list');
    }
  }

  async findOne(alterationId: string): Promise<AlterationDocument> {
    try {
      const alteration = await this.alterationModel.findOne({ alterationId }).exec();

      if (!alteration) {
        throw new NotFoundException('Alteration not found');
      }

      return alteration;
    } catch (error) {
      this.rethrowServiceError(error, 'retrieve');
    }
  }

  async update(
    alterationId: string,
    dto: UpdateAlterationDto,
    userId: string,
  ): Promise<AlterationDocument> {
    const session = await this.connection.startSession();

    try {
      session.startTransaction();
      const alterationQuery = this.alterationModel.findOne({ alterationId });
      const alteration = await this.withSession(alterationQuery, session).exec();

      if (!alteration) throw new NotFoundException('Alteration not found');
      const previousStatus = alteration.status;

      if (dto.status !== undefined) {
        this.validateStatusTransition(alteration.status, dto.status);
      }

      if (dto.charge !== undefined && alteration.billingOrderId) {
        throw new ConflictException('Alteration charge cannot be changed after billing');
      }

      if (dto.description !== undefined) alteration.description = dto.description;
      if (dto.notes !== undefined) alteration.notes = dto.notes;
      if (dto.charge !== undefined) alteration.charge = dto.charge;

      if (dto.status !== undefined) {
        alteration.status = dto.status;
        if (dto.status === AlterationStatus.COMPLETED) {
          alteration.completionDate = new Date();
        }
      }

      alteration.updatedBy = userId;
      const updatedAlteration = await alteration.save({ session });
      await this.auditLogsService.record(
        {
          actorId: userId,
          action: dto.status !== undefined ? AuditAction.STATUS_CHANGED : AuditAction.UPDATED,
          entityType: AuditEntityType.ALTERATION,
          entityId: updatedAlteration.alterationId,
          metadata: {
            changedFields: Object.keys(dto),
            ...(dto.status !== undefined
              ? { from: previousStatus, to: dto.status }
              : {}),
            ...(dto.charge !== undefined ? { chargeChanged: true } : {}),
          },
        },
        session,
      );
      await session.commitTransaction();
      return updatedAlteration;
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      this.rethrowServiceError(error, 'update');
    } finally {
      await session.endSession();
    }
  }

  async createBill(alterationId: string, userId: string): Promise<OrderDocument> {
    let session: ClientSession | undefined;

    try {
      session = await this.connection.startSession();
      session.startTransaction();

      const alteration = await this.alterationModel
        .findOne({ alterationId })
        .session(session)
        .exec();

      if (!alteration) {
        throw new NotFoundException('Alteration not found');
      }

      if (alteration.billingOrderId) {
        throw new ConflictException('Alteration already has a billing order');
      }

      if (alteration.status !== AlterationStatus.COMPLETED) {
        throw new BadRequestException(
          `Alteration with status ${alteration.status} cannot be billed`,
        );
      }

      if (!Number.isFinite(alteration.charge) || alteration.charge <= 0) {
        throw new BadRequestException(
          'Alteration charge must be greater than zero to create a bill',
        );
      }

      await this.validateBillingReferences(alteration, session);

      const orderId = await this.generateOrderId(session);
      const now = new Date();
      const bill = new this.orderModel({
        orderId,
        orderType: OrderType.ALTERATION,
        customerId: alteration.customerId,
        originalOrderId: alteration.originalOrderId,
        sourceAlterationId: alteration.alterationId,
        orderDate: now,
        status: OrderStatus.CONFIRMED,
        totalAmount: alteration.charge,
        paidAmount: 0,
        balanceAmount: alteration.charge,
        createdBy: userId,
        updatedBy: userId,
      });

      await bill.save({ session });

      const billedAlteration = await this.alterationModel
        .findOneAndUpdate(
          {
            alterationId: alteration.alterationId,
            status: AlterationStatus.COMPLETED,
            billingOrderId: { $exists: false },
          },
          {
            $set: {
              billingOrderId: orderId,
              updatedBy: userId,
            },
          },
          { new: true, session },
        )
        .exec();

      if (!billedAlteration) {
        throw new ConflictException('Alteration billing state changed; retry billing');
      }

      await this.auditLogsService.record(
        {
          actorId: userId,
          action: AuditAction.BILL_CREATED,
          entityType: AuditEntityType.ALTERATION_BILL,
          entityId: bill.orderId,
          metadata: {
            orderType: OrderType.ALTERATION,
            sourceAlterationId: alteration.alterationId,
            originalOrderId: alteration.originalOrderId,
          },
        },
        session,
      );

      await session.commitTransaction();
      return bill;
    } catch (error) {
      if (session?.inTransaction()) {
        await session.abortTransaction();
      }

      return this.rethrowServiceError(error, 'create alteration bill');
    } finally {
      await session?.endSession();
    }
  }

  private async validateReferences(
    dto: CreateAlterationDto,
    session: ClientSession,
  ): Promise<void> {
    const customerExists = await this.customerModel
      .exists({ customerId: dto.customerId })
      .session(session)
      .exec();

    if (!customerExists) {
      throw new NotFoundException('Customer not found');
    }

    const order = await this.orderModel
      .findOne({ orderId: dto.originalOrderId })
      .select({ customerId: 1 })
      .session(session)
      .exec();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.customerId !== dto.customerId) {
      throw new BadRequestException('Order does not belong to the requested customer');
    }

    if (!Types.ObjectId.isValid(dto.originalOrderItemId)) {
      throw new BadRequestException('originalOrderItemId must be a valid order item ID');
    }

    const orderItem = await this.orderItemModel
      .findOne({ _id: new Types.ObjectId(dto.originalOrderItemId), orderId: dto.originalOrderId })
      .select({ _id: 1 })
      .session(session)
      .exec();

    if (!orderItem) {
      throw new BadRequestException('Order item does not belong to the requested order');
    }
  }

  private async validateBillingReferences(
    alteration: AlterationDocument,
    session: ClientSession,
  ): Promise<void> {
    const customerExists = await this.customerModel
      .exists({ customerId: alteration.customerId })
      .session(session)
      .exec();

    if (!customerExists) {
      throw new NotFoundException('Customer not found');
    }

    const originalOrder = await this.orderModel
      .findOne({ orderId: alteration.originalOrderId })
      .select({ customerId: 1 })
      .session(session)
      .exec();

    if (!originalOrder) {
      throw new NotFoundException('Original order not found');
    }

    if (originalOrder.customerId !== alteration.customerId) {
      throw new BadRequestException('Original order does not belong to the alteration customer');
    }

    const orderItem = await this.orderItemModel
      .findOne({
        _id: alteration.originalOrderItemId,
        orderId: alteration.originalOrderId,
      })
      .select({ _id: 1 })
      .session(session)
      .exec();

    if (!orderItem) {
      throw new BadRequestException('Original order item does not belong to the original order');
    }
  }

  private async generateOrderId(session: ClientSession): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: 'order' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session },
      )
      .exec();

    if (!counter) {
      throw new InternalServerErrorException('Failed to generate order ID');
    }

    return `ORD-${String(counter.sequence).padStart(6, '0')}`;
  }

  private withSession<T extends { session?: (session: ClientSession) => T }>(
    query: T,
    session: ClientSession,
  ): T {
    return typeof query.session === 'function' ? query.session(session) : query;
  }

  private validateStatusTransition(
    currentStatus: AlterationStatus,
    nextStatus: AlterationStatus,
  ): void {
    if (!this.allowedStatusTransitions[currentStatus]?.includes(nextStatus)) {
      throw new BadRequestException(
        `Alteration status cannot transition from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  private async generateAlterationId(session: ClientSession): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: 'alteration' },
        { $inc: { sequence: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session },
      )
      .exec();

    if (!counter) {
      throw new InternalServerErrorException('Failed to generate alteration ID');
    }

    return `ALT-${String(counter.sequence).padStart(6, '0')}`;
  }

  private rethrowServiceError(error: unknown, action: string): never {
    if (error instanceof HttpException) throw error;
    if (this.isDuplicateKeyError(error)) {
      throw new ConflictException(
        action === 'create alteration bill'
          ? 'Alteration already has a billing order'
          : 'Alteration ID already exists',
      );
    }
    throw new InternalServerErrorException(`Unable to ${action} alteration`);
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
