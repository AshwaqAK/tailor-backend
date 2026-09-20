import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Customer, CustomerDocument } from './schemas/customer.schema';
import { CustomerCounter, CustomerCounterDocument } from './schemas/customer-counter.schema';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerResponse } from './types/customer-response.type';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,

    @InjectModel(CustomerCounter.name)
    private readonly customerCounterModel: Model<CustomerCounterDocument>,
  ) { }

  async createCustomer(
    createCustomerDto: CreateCustomerDto,
    userId: string,
  ): Promise<CustomerResponse> {
    try {
      const normalizedPhone = this.normalizeIndianPhone(createCustomerDto.phone);

      const existingCustomer = await this.customerModel
        .findOne({
          phone: normalizedPhone,
          isActive: true,
        })
        .lean()
        .exec();

      if (existingCustomer) {
        throw new ConflictException('An active customer with this phone number already exists');
      }

      const customerId = await this.generateCustomerId();

      const customer = await this.customerModel.create({
        ...createCustomerDto,
        phone: normalizedPhone,
        alternatePhone: createCustomerDto.alternatePhone
          ? this.normalizeIndianPhone(createCustomerDto.alternatePhone)
          : undefined,
        customerId,
        createdBy: userId,
        updatedBy: userId,
      });

      return this.toCustomerResponse(customer);
    } catch (error) {
      console.log(error)
      throw error
    }
  }

  async findCustomerById(id: string): Promise<CustomerResponse> {
    const customer = await this.customerModel.findById(id).exec();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.toCustomerResponse(customer);
  }

  async findCustomerByCustomerId(customerId: string): Promise<CustomerResponse> {
    const customer = await this.customerModel.findOne({ customerId }).exec();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.toCustomerResponse(customer);
  }

  async findCustomerByPhone(phone: string): Promise<CustomerResponse> {
    const normalizedPhone = this.normalizeIndianPhone(phone);

    const customer = await this.customerModel
      .findOne({
        phone: normalizedPhone,
        isActive: true,
      })
      .exec();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.toCustomerResponse(customer);
  }

  async searchCustomers(query: CustomerQueryDto): Promise<{
    data: CustomerResponse[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const {
      page = 1,
      limit = 20,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive,
    } = query;

    const filter: Record<string, unknown> = {};

    if (typeof isActive === 'boolean') {
      filter.isActive = isActive;
    }

    if (search?.trim()) {
      const searchValue = search.trim();

      filter.$or = [
        { name: { $regex: searchValue, $options: 'i' } },
        { phone: this.normalizeSearchPhone(searchValue) },
        {
          customerId: {
            $regex: `^${this.escapeRegex(searchValue)}`,
            $options: 'i',
          },
        },
      ];
    }

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const [customers, total] = await Promise.all([
      this.customerModel
        .find(filter)
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.customerModel.countDocuments(filter).exec(),
    ]);

    return {
      data: customers.map((customer) => this.toCustomerResponse(customer)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateCustomer(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
    userId: string,
  ): Promise<CustomerResponse> {
    const updateData: Record<string, unknown> = {
      ...updateCustomerDto,
      updatedBy: new Types.ObjectId(userId),
    };

    if (updateCustomerDto.phone) {
      const normalizedPhone = this.normalizeIndianPhone(updateCustomerDto.phone);

      const existingCustomer = await this.customerModel
        .findOne({
          phone: normalizedPhone,
          _id: { $ne: id },
          isActive: true,
        })
        .lean()
        .exec();

      if (existingCustomer) {
        throw new ConflictException('An active customer with this phone number already exists');
      }

      updateData.phone = normalizedPhone;
    }

    if (updateCustomerDto.alternatePhone) {
      updateData.alternatePhone = this.normalizeIndianPhone(updateCustomerDto.alternatePhone);
    }

    const customer = await this.customerModel
      .findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.toCustomerResponse(customer);
  }

  async deactivateCustomer(id: string, userId: string): Promise<CustomerResponse> {
    const customer = await this.customerModel
      .findByIdAndUpdate(
        id,
        {
          isActive: false,
          updatedBy: new Types.ObjectId(userId),
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.toCustomerResponse(customer);
  }

  private async generateCustomerId(): Promise<string> {
    const counter = await this.customerCounterModel
      .findOneAndUpdate(
        { _id: 'customer' },
        { $inc: { sequence: 1 } },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
        },
      )
      .exec();

    if (!counter) {
      throw new Error('Failed to generate customer ID');
    }

    return `CUS-${String(counter.sequence).padStart(6, '0')}`;
  }

  private normalizeIndianPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');

    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      return `+91${digits}`;
    }

    if (digits.length === 12 && digits.startsWith('91')) {
      const mobileNumber = digits.slice(2);

      if (/^[6-9]\d{9}$/.test(mobileNumber)) {
        return `+91${mobileNumber}`;
      }
    }

    throw new ConflictException('Invalid Indian mobile phone number');
  }

  private normalizeSearchPhone(phone: string): string {
    try {
      return this.normalizeIndianPhone(phone);
    } catch {
      return phone.trim();
    }
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private toCustomerResponse(customer: CustomerDocument): CustomerResponse {
    return {
      _id: customer._id.toString(),
      customerId: customer.customerId,
      name: customer.name,
      phone: customer.phone,
      alternatePhone: customer.alternatePhone,
      email: customer.email,
      gender: customer.gender,
      photo: customer.photo,
      notes: customer.notes,
      isActive: customer.isActive,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }
}
