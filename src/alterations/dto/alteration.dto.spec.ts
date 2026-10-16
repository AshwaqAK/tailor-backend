import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';

import { CreateAlterationDto } from './create-alteration.dto';
import { UpdateAlterationDto } from './update-alteration.dto';

describe('Alteration DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const createMetadata: ArgumentMetadata = { type: 'body', metatype: CreateAlterationDto };
  const updateMetadata: ArgumentMetadata = { type: 'body', metatype: UpdateAlterationDto };
  const validInput = () => ({
    customerId: 'CUS-000001',
    originalOrderId: 'ORD-000001',
    originalOrderItemId: '507f1f77bcf86cd799439011',
    description: 'Shorten sleeves',
    notes: 'Keep the existing cuff',
    charge: '125.50',
  });

  it('accepts valid creation data and transforms charge', async () => {
    await expect(pipe.transform(validInput(), createMetadata)).resolves.toEqual(
      expect.objectContaining({ charge: 125.5 }),
    );
  });

  it.each(['customerId', 'originalOrderId', 'originalOrderItemId', 'description'])(
    'rejects missing required %s',
    async (field) => {
      const input: Record<string, unknown> = validInput();
      delete input[field];

      await expect(pipe.transform(input, createMetadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it.each([
    { originalOrderItemId: 'not-an-object-id' },
    { customerId: 'CUS-1' },
    { originalOrderId: 'ORD-1' },
    { description: '   ' },
    { charge: -1 },
    { charge: 'not-a-number' },
  ])('rejects invalid alteration creation input %#', async (invalidInput) => {
    await expect(
      pipe.transform({ ...validInput(), ...invalidInput }, createMetadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['alterationId', 'status', 'requestDate', 'completionDate', 'createdBy', 'updatedBy'])(
    'rejects server-controlled %s on creation',
    async (field) => {
      await expect(
        pipe.transform({ ...validInput(), [field]: 'client-value' }, createMetadata),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('accepts editable details and lifecycle status on update', async () => {
    await expect(
      pipe.transform(
        { description: 'Adjust hem', notes: 'Urgent', charge: 50, status: 'IN_PROGRESS' },
        updateMetadata,
      ),
    ).resolves.toEqual(expect.objectContaining({ status: 'IN_PROGRESS', charge: 50 }));
  });

  it.each([{ status: 'UNKNOWN' }, { charge: -0.01 }, { completionDate: new Date() }])(
    'rejects unsupported update values %#',
    async (input) => {
      await expect(pipe.transform(input, updateMetadata)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
});
