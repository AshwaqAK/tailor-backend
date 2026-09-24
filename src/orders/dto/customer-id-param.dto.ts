import { IsString, Matches } from 'class-validator';

export class CustomerIdParamDto {
  @IsString()
  @Matches(/^CUS-?\d+$/, {
    message: 'customerId must be a valid human-readable customer ID',
  })
  customerId!: string;
}
