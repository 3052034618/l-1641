import { IsString, IsNotEmpty, IsOptional, IsObject, IsNumber } from 'class-validator';

export interface EquipmentThresholds {
  minTemperature: number;
  maxTemperature: number;
  minPressure: number;
  maxPressure: number;
  cycleTime: number;
}

export class CreateEquipmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  model: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsString()
  @IsOptional()
  manufacturer?: string;

  @IsObject()
  @IsOptional()
  thresholds?: EquipmentThresholds;

  @IsNumber()
  @IsOptional()
  maxLoad?: number;
}

export class UpdateEquipmentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  serialNumber?: string;

  @IsString()
  @IsOptional()
  manufacturer?: string;

  @IsObject()
  @IsOptional()
  thresholds?: EquipmentThresholds;

  @IsNumber()
  @IsOptional()
  maxLoad?: number;

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  lastMaintenanceDate?: Date;

  @IsOptional()
  nextMaintenanceDate?: Date;
}
