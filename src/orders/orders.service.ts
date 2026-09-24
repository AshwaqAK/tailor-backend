import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';

import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Measurement, MeasurementDocument } from '../measurements/schemas/measurement.schema';
import { Counter, CounterDocument } from '../users/schemas/counter.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './enums/order-status.enum';
import { OrderItem, OrderItemDocument } from './schemas/order-item.schema';
import { Order, OrderDocument } from './schemas/order.schema';

export interface OrderWithItems {
  order: OrderDocument;
  items: OrderItemDocument[];
}

export type CreateOrderResult = OrderWithItems;

@Injectable()
export class OrdersService {
  private readonly allowedStatusTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
    [OrderStatus.DRAFT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
    [OrderStatus.IN_PROGRESS]: [OrderStatus.READY, OrderStatus.CANCELLED],
    [OrderStatus.READY]: [OrderStatus.DELIVERED],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.CANCELLED]: [],
  };

  constructor(
    @InjectConnection()
    private readonly connection: Connection,

    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,

    @InjectModel(OrderItem.name)
    private readonly orderItemModel: Model<OrderItemDocument>,

    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Measurement.name)
    private readonly measurementModel: Model<MeasurementDocument>,

    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
  ) {}

  async createOrder(createOrderDto: CreateOrderDto, userId: string): Promise<CreateOrderResult> {
    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      if (!createOrderDto.items?.length) {
        throw new BadRequestException('At least one order item is required');
      }

      const customerExists = await this.customerModel
        .exists({ customerId: createOrderDto.customerId })
        .session(session)
        .exec();

      if (!customerExists) {
        throw new NotFoundException('Customer not found');
      }

      const orderId = await this.generateOrderId(session);
      const orderItems: OrderItemDocument[] = [];

      for (const itemDto of createOrderDto.items) {
        const measurement = await this.measurementModel
          .findById(itemDto.measurementId)
          .session(session)
          .exec();

        if (!measurement) {
          throw new NotFoundException('Measurement not found');
        }

        if (measurement.customerId !== createOrderDto.customerId) {
          throw new BadRequestException('Measurement does not belong to the requested customer');
        }

        if (measurement.clothingType !== itemDto.clothingType) {
          throw new BadRequestException(
            'Measurement clothing type does not match the order item clothing type',
          );
        }

        const measurementValues = new Map<string, number>(measurement.measurements);
        const orderItem = new this.orderItemModel({
          orderId,
          clothingType: itemDto.clothingType,
          quantity: itemDto.quantity,
          unitPrice: itemDto.unitPrice,
          measurementVersion: measurement.version,
          measurementSnapshot: {
            customerId: measurement.customerId,
            measurementId: measurement._id,
            measurementVersion: measurement.version,
            clothingType: measurement.clothingType,
            measurements: measurementValues,
            fitPreference: measurement.fitPreference,
            notes: measurement.notes,
            measuredAt: new Date(measurement.measuredAt),
          },
          notes: itemDto.notes,
        });

        orderItems.push(orderItem);
      }

      const order = new this.orderModel({
        orderId,
        customerId: createOrderDto.customerId,
        orderDate: createOrderDto.orderDate,
        expectedDeliveryDate: createOrderDto.expectedDeliveryDate,
        notes: createOrderDto.notes,
        createdBy: userId,
        updatedBy: userId,
      });

      await order.save({ session });

      for (const orderItem of orderItems) {
        await orderItem.save({ session });
      }

      await session.commitTransaction();

      return {
        order,
        items: orderItems,
      };
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      this.rethrowServiceError(error);
    } finally {
      await session.endSession();
    }
  }

  async getOrderByOrderId(orderId: string): Promise<OrderWithItems> {
    const order = await this.orderModel.findOne({ orderId }).exec();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const items = await this.orderItemModel.find({ orderId }).sort({ createdAt: 1 }).exec();

    return {
      order,
      items,
    };
  }

  async getOrdersByCustomerId(customerId: string): Promise<OrderWithItems[]> {
    const orders = await this.orderModel.find({ customerId }).sort({ createdAt: -1 }).exec();

    if (orders.length === 0) {
      return [];
    }

    const orderIds = orders.map((order) => order.orderId);
    const items = await this.orderItemModel
      .find({
        orderId: {
          $in: orderIds,
        },
      })
      .sort({ createdAt: 1 })
      .exec();

    const itemsByOrderId = new Map<string, OrderItemDocument[]>();

    for (const item of items) {
      const orderItems = itemsByOrderId.get(item.orderId) ?? [];
      orderItems.push(item);
      itemsByOrderId.set(item.orderId, orderItems);
    }

    return orders.map((order) => ({
      order,
      items: itemsByOrderId.get(order.orderId) ?? [],
    }));
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    userId: string,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findOne({ orderId }).exec();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const allowedStatuses = this.allowedStatusTransitions[order.status];

    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(
        `Order status cannot transition from ${order.status} to ${status}`,
      );
    }

    order.status = status;
    order.updatedBy = userId;

    return order.save();
  }

  private async generateOrderId(session: ClientSession): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: 'order' },
        { $inc: { sequence: 1 } },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          session,
        },
      )
      .exec();

    if (!counter) {
      throw new InternalServerErrorException('Failed to generate order ID');
    }

    return `ORD-${String(counter.sequence).padStart(6, '0')}`;
  }

  private rethrowServiceError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (this.isDuplicateKeyError(error)) {
      throw new ConflictException('Order ID already exists');
    }

    throw new InternalServerErrorException('Unable to create order');
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
