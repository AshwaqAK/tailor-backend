import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class AlterationIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^ALT-\d{6}$/.test(value)) {
      throw new BadRequestException('alterationId must be a valid alteration ID');
    }

    return value;
  }
}
