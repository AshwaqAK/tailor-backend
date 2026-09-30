import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class PaymentIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^PAY-\d{6}$/.test(value)) {
      throw new BadRequestException('paymentId must be a valid payment ID');
    }

    return value;
  }
}
