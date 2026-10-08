import { BadRequestException, Injectable } from '@nestjs/common';

import { InputType } from './enums/input-type.enum';
import { PricingType } from './enums/pricing-type.enum';
import type {
  CustomizationGroupConfiguration,
  CustomizationOptionConfiguration,
  GarmentType,
} from './schemas/garment-type.schema';

export type CustomizationSelections = Record<string, unknown>;

export interface CustomizationOptionPricing {
  optionName: string;
  pricingType: PricingType;
  configuredPrice: number;
  submittedValue?: number;
  calculatedCharge: number;
}

export interface CustomizationGroupPricing {
  groupName: string;
  options: CustomizationOptionPricing[];
  calculatedCharge: number;
}

export interface TailoringPricing {
  baseTailoringPrice: number;
  customizationGroups: CustomizationGroupPricing[];
  calculatedCustomizationCharge: number;
  calculatedPerGarmentTailoringAmount: number;
  quantity: number;
  finalTailoringTotal: number;
}

@Injectable()
export class GarmentTypePricingService {
  calculateTailoringTotal(
    garmentType: Pick<GarmentType, 'tailoringService' | 'customizationGroups'>,
    selections: CustomizationSelections = {},
    quantity: number,
  ): number {
    return this.calculateTailoringPricing(garmentType, selections, quantity).finalTailoringTotal;
  }

  calculateTailoringPricing(
    garmentType: Pick<GarmentType, 'tailoringService' | 'customizationGroups'>,
    selections: CustomizationSelections = {},
    quantity: number,
  ): TailoringPricing {
    this.validateQuantity(quantity);

    const baseTailoringPrice = garmentType.tailoringService.basePrice;

    if (!Number.isFinite(baseTailoringPrice) || baseTailoringPrice < 0) {
      throw new BadRequestException('Garment type base tailoring price must be non-negative');
    }

    const customizationGroups = this.calculateCustomizationCharges(
      garmentType.customizationGroups,
      selections,
    );
    const calculatedCustomizationCharge = customizationGroups.reduce(
      (total, group) => total + group.calculatedCharge,
      0,
    );
    const calculatedPerGarmentTailoringAmount = this.roundCurrency(
      baseTailoringPrice + calculatedCustomizationCharge,
    );
    const finalTailoringTotal = this.roundCurrency(
      calculatedPerGarmentTailoringAmount * quantity,
    );

    if (!Number.isFinite(finalTailoringTotal) || finalTailoringTotal < 0) {
      throw new BadRequestException('Garment type tailoring total must be non-negative');
    }

    return {
      baseTailoringPrice,
      customizationGroups,
      calculatedCustomizationCharge: this.roundCurrency(calculatedCustomizationCharge),
      calculatedPerGarmentTailoringAmount,
      quantity,
      finalTailoringTotal,
    };
  }

  calculatePrice(
    garmentType: Pick<GarmentType, 'tailoringService' | 'customizationGroups'>,
    selections: CustomizationSelections = {},
    quantity: number,
  ): number {
    return this.calculateTailoringTotal(garmentType, selections, quantity);
  }

  private calculateCustomizationCharges(
    groups: CustomizationGroupConfiguration[],
    selections: CustomizationSelections,
  ): CustomizationGroupPricing[] {
    const groupsByName = new Map(groups.map((group) => [group.name, group]));
    const calculations: CustomizationGroupPricing[] = [];

    for (const [groupName, value] of Object.entries(selections)) {
      const group = groupsByName.get(groupName);

      if (!group) {
        throw new BadRequestException(`Unknown customization group: ${groupName}`);
      }

      calculations.push(this.calculateGroupCharge(group, value));
    }

    return calculations;
  }

  private calculateGroupCharge(
    group: CustomizationGroupConfiguration,
    value: unknown,
  ): CustomizationGroupPricing {
    const optionsByName = new Map(group.options.map((option) => [option.name, option]));

    if (this.isInputType(group, InputType.SINGLE_SELECT)) {
      if (typeof value !== 'string') {
        throw new BadRequestException(`Invalid value type for customization group: ${group.name}`);
      }

      const option = this.getOption(group, optionsByName, value);
      this.ensureInputType(option, InputType.SINGLE_SELECT, group.name);
      return this.groupPricing(group, [this.optionPricing(option, 1)]);
    }

    if (this.isInputType(group, InputType.MULTI_SELECT)) {
      if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
        throw new BadRequestException(`Invalid value type for customization group: ${group.name}`);
      }

      const options = value.map((optionName) => {
        const option = this.getOption(group, optionsByName, optionName);
        this.ensureInputType(option, InputType.MULTI_SELECT, group.name);
        return this.optionPricing(option, 1);
      });
      return this.groupPricing(group, options);
    }

    const option = this.getSingleConfiguredOption(group);

    if (this.isInputType(group, InputType.BOOLEAN)) {
      if (typeof value !== 'boolean') {
        throw new BadRequestException(`Invalid value type for customization group: ${group.name}`);
      }

      this.ensureInputType(option, InputType.BOOLEAN, group.name);
      return this.groupPricing(group, value ? [this.optionPricing(option, 1)] : []);
    }

    if (this.isInputType(group, InputType.NUMBER)) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new BadRequestException(`Invalid value type for customization group: ${group.name}`);
      }

      this.ensureInputType(option, InputType.NUMBER, group.name);
      return this.groupPricing(group, [this.optionPricing(option, value, value)]);
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`Invalid value type for customization group: ${group.name}`);
    }

    this.ensureInputType(option, InputType.TEXT, group.name);
    return this.groupPricing(group, [this.optionPricing(option, 1, undefined, true)]);
  }

  private groupPricing(
    group: CustomizationGroupConfiguration,
    options: CustomizationOptionPricing[],
  ): CustomizationGroupPricing {
    return {
      groupName: group.name,
      options,
      calculatedCharge: this.roundCurrency(options.reduce((total, option) => total + option.calculatedCharge, 0)),
    };
  }

  private getOption(
    group: CustomizationGroupConfiguration,
    optionsByName: Map<string, CustomizationOptionConfiguration>,
    optionName: string,
  ): CustomizationOptionConfiguration {
    const option = optionsByName.get(optionName);

    if (!option) {
      throw new BadRequestException(
        `Unknown customization option: ${optionName} in group ${group.name}`,
      );
    }

    return option;
  }

  private getSingleConfiguredOption(
    group: CustomizationGroupConfiguration,
  ): CustomizationOptionConfiguration {
    const [option] = group.options;

    if (!option) {
      throw new BadRequestException(`Customization group has no options: ${group.name}`);
    }

    return option;
  }

  private ensureInputType(
    option: CustomizationOptionConfiguration,
    expected: InputType,
    groupName: string,
  ): void {
    if (option.inputType !== expected) {
      throw new BadRequestException(`Invalid input type for customization group: ${groupName}`);
    }
  }

  private isInputType(group: CustomizationGroupConfiguration, inputType: InputType): boolean {
    return group.options.some((option) => option.inputType === inputType);
  }

  private calculateOptionCharge(option: CustomizationOptionConfiguration, units: number): number {
    if (!Number.isFinite(option.price) || option.price < 0) {
      throw new BadRequestException(`Invalid configured price for customization option: ${option.name}`);
    }

    if (option.pricingType === PricingType.FIXED) {
      return option.price;
    }

    if (option.pricingType === PricingType.PER_UNIT) {
      return option.price * units;
    }

    throw new BadRequestException(`Unsupported pricing type for customization option: ${option.name}`);
  }

  private optionPricing(
    option: CustomizationOptionConfiguration,
    units: number,
    submittedValue?: number,
    noAutomaticPrice = false,
  ): CustomizationOptionPricing {
    return {
      optionName: option.name,
      pricingType: option.pricingType,
      configuredPrice: option.price,
      ...(submittedValue !== undefined ? { submittedValue } : {}),
      calculatedCharge: noAutomaticPrice ? 0 : this.calculateOptionCharge(option, units),
    };
  }

  private validateQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Garment quantity must be a positive integer');
    }
  }

  private roundCurrency(value: number): number {
    return Number(value.toFixed(2));
  }
}
