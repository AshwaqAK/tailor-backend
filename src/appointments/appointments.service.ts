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
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Counter, CounterDocument } from '../users/schemas/counter.schema';
import { AppointmentQueryDto } from './dto/appointment-query.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentStatus } from './enums/appointment-status.enum';
import { Appointment, AppointmentDocument } from './schemas/appointment.schema';

export interface PaginatedAppointments {
  data: AppointmentDocument[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class AppointmentsService {
  private readonly allowedStatusTransitions: Record<
    AppointmentStatus,
    readonly AppointmentStatus[]
  > = {
    [AppointmentStatus.SCHEDULED]: [
      AppointmentStatus.CONFIRMED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ],
    [AppointmentStatus.CONFIRMED]: [
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ],
    [AppointmentStatus.COMPLETED]: [],
    [AppointmentStatus.CANCELLED]: [],
    [AppointmentStatus.NO_SHOW]: [],
  };

  constructor(
    @InjectConnection()
    private readonly connection: Connection,

    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,

    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,

    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
  ) {}

  async create(
    createAppointmentDto: CreateAppointmentDto,
    userId: string,
  ): Promise<AppointmentDocument> {
    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      await this.validateReferences(
        createAppointmentDto.customerId,
        createAppointmentDto.orderId,
        session,
      );

      const appointmentId = await this.generateAppointmentId(session);
      const appointment = new this.appointmentModel({
        appointmentId,
        customerId: createAppointmentDto.customerId,
        orderId: createAppointmentDto.orderId,
        appointmentDate: createAppointmentDto.appointmentDate,
        appointmentTime: createAppointmentDto.appointmentTime,
        type: createAppointmentDto.type,
        notes: createAppointmentDto.notes,
        createdBy: userId,
        updatedBy: userId,
      });

      await appointment.save({ session });
      await session.commitTransaction();

      return appointment;
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }

      this.rethrowServiceError(error, 'create');
    } finally {
      await session.endSession();
    }
  }

  async findAll(query: AppointmentQueryDto): Promise<PaginatedAppointments> {
    const {
      page = 1,
      limit = 20,
      customerId,
      orderId,
      appointmentDate,
      type,
      status,
      sortBy = 'appointmentDate',
      sortOrder = 'asc',
    } = query;
    const filter: Record<string, unknown> = {};

    if (customerId) {
      filter.customerId = customerId;
    }

    if (orderId) {
      filter.orderId = orderId;
    }

    if (appointmentDate) {
      filter.appointmentDate = appointmentDate;
    }

    if (type) {
      filter.type = type;
    }

    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    try {
      const [appointments, total] = await Promise.all([
        this.appointmentModel
          .find(filter)
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.appointmentModel.countDocuments(filter).exec(),
      ]);

      return {
        data: appointments,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.rethrowServiceError(error, 'list');
    }
  }

  async findOne(appointmentId: string): Promise<AppointmentDocument> {
    try {
      const appointment = await this.appointmentModel.findOne({ appointmentId }).exec();

      if (!appointment) {
        throw new NotFoundException('Appointment not found');
      }

      return appointment;
    } catch (error) {
      this.rethrowServiceError(error, 'retrieve');
    }
  }

  async update(
    appointmentId: string,
    updateAppointmentDto: UpdateAppointmentDto,
    userId: string,
  ): Promise<AppointmentDocument> {
    try {
      const appointment = await this.findOne(appointmentId);

      if (updateAppointmentDto.status !== undefined) {
        this.validateStatusTransition(appointment.status, updateAppointmentDto.status);
      }

      const customerId = updateAppointmentDto.customerId ?? appointment.customerId;
      const orderId = updateAppointmentDto.orderId ?? appointment.orderId;

      await this.validateReferences(customerId, orderId);

      if (updateAppointmentDto.customerId !== undefined) {
        appointment.customerId = updateAppointmentDto.customerId;
      }

      if (updateAppointmentDto.orderId !== undefined) {
        appointment.orderId = updateAppointmentDto.orderId;
      }

      if (updateAppointmentDto.appointmentDate !== undefined) {
        appointment.appointmentDate = updateAppointmentDto.appointmentDate;
      }

      if (updateAppointmentDto.appointmentTime !== undefined) {
        appointment.appointmentTime = updateAppointmentDto.appointmentTime;
      }

      if (updateAppointmentDto.type !== undefined) {
        appointment.type = updateAppointmentDto.type;
      }

      if (updateAppointmentDto.status !== undefined) {
        appointment.status = updateAppointmentDto.status;
      }

      if (updateAppointmentDto.notes !== undefined) {
        appointment.notes = updateAppointmentDto.notes;
      }

      appointment.updatedBy = userId;

      return await appointment.save();
    } catch (error) {
      this.rethrowServiceError(error, 'update');
    }
  }

  async remove(appointmentId: string): Promise<AppointmentDocument> {
    try {
      const appointment = await this.appointmentModel.findOneAndDelete({ appointmentId }).exec();

      if (!appointment) {
        throw new NotFoundException('Appointment not found');
      }

      return appointment;
    } catch (error) {
      this.rethrowServiceError(error, 'remove');
    }
  }

  private async validateReferences(
    customerId: string,
    orderId?: string,
    session?: ClientSession,
  ): Promise<void> {
    const customerQuery = this.customerModel.exists({ customerId });

    if (session) {
      customerQuery.session(session);
    }

    const customerExists = await customerQuery.exec();

    if (!customerExists) {
      throw new NotFoundException('Customer not found');
    }

    if (!orderId) {
      return;
    }

    const orderQuery = this.orderModel.findOne({ orderId }).select({ customerId: 1 });

    if (session) {
      orderQuery.session(session);
    }

    const order = await orderQuery.exec();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.customerId !== customerId) {
      throw new BadRequestException('Order does not belong to the requested customer');
    }
  }

  private validateStatusTransition(
    currentStatus: AppointmentStatus,
    nextStatus: AppointmentStatus,
  ): void {
    const allowedStatuses = this.allowedStatusTransitions[currentStatus];

    if (!allowedStatuses.includes(nextStatus)) {
      throw new BadRequestException(
        `Appointment status cannot transition from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  private async generateAppointmentId(session: ClientSession): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: 'appointment' },
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
      throw new InternalServerErrorException('Failed to generate appointment ID');
    }

    return `APT-${String(counter.sequence).padStart(6, '0')}`;
  }

  private rethrowServiceError(error: unknown, action: string): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (this.isDuplicateKeyError(error)) {
      throw new ConflictException('Appointment ID already exists');
    }

    throw new InternalServerErrorException(`Unable to ${action} appointment`);
  }

  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
